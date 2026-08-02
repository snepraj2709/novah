import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cosine,
  scoreEvaluation,
  validateDataset,
} from '../../../scripts/evaluate-retrieval.mjs';
import {
  MAX_JSON_REQUEST_BYTES,
  MAX_NOTE_TEXT_LENGTH,
} from '../../../packages/shared/src/constants/index.ts';
import { captureNoteRequestSchema } from '../../../packages/shared/src/contracts/index.ts';
import { handleAccountDeletion } from '../_shared/account-deletion-handler.ts';
import { handleCaptureNote } from '../_shared/capture-handler.ts';
import { ApiError } from '../_shared/errors.ts';
import { isLocalSupabaseRuntimeUrl } from '../_shared/environment.ts';
import { createHttpHandler, parseJson } from '../_shared/http.ts';
import { OpenAiProvider } from '../_shared/openai.ts';
import { handleSearchNotes } from '../_shared/search-handler.ts';
import { TelegramApiClient } from '../_shared/telegram-api.ts';
import { handleTelegramLinkCode } from '../_shared/telegram-link-handler.ts';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';

const deniedAuthenticator = {
  async authenticate(): Promise<never> {
    throw new ApiError(401, 'unauthorized', 'Authentication failed.');
  },
};

function jsonRequest(body: unknown = {}): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Phase 7 user-function authorization', () => {
  it('denies all four user functions before repository or provider access', async () => {
    let sideEffects = 0;
    const repository = new Proxy(
      {},
      {
        get() {
          return async () => {
            sideEffects += 1;
          };
        },
      },
    );
    const ai = new Proxy(
      {},
      {
        get() {
          return async () => {
            sideEffects += 1;
          };
        },
      },
    );

    const calls = [
      () =>
        handleCaptureNote(jsonRequest(), {
          authenticator: deniedAuthenticator,
          repository: repository as never,
          ai: ai as never,
        }),
      () =>
        handleSearchNotes(jsonRequest(), {
          authenticator: deniedAuthenticator,
          repository: repository as never,
          ai: ai as never,
        }),
      () =>
        handleTelegramLinkCode(jsonRequest(), {
          authenticator: deniedAuthenticator,
          repository: repository as never,
        }),
      () =>
        handleAccountDeletion(jsonRequest(), {
          authenticator: deniedAuthenticator,
          repository: repository as never,
        }),
    ];

    for (const call of calls) {
      await assert.rejects(
        call,
        (error: unknown) => error instanceof ApiError && error.status === 401,
      );
    }
    assert.equal(sideEffects, 0);
  });
});

describe('Phase 7 request boundaries', () => {
  it('recognizes only explicit local Supabase runtime hosts', () => {
    for (const value of [
      'http://127.0.0.1:54321',
      'http://localhost:54321',
      'http://kong:8000',
      'http://host.docker.internal:54321',
    ]) {
      assert.equal(isLocalSupabaseRuntimeUrl(value), true);
    }
    for (const value of [
      'https://fqinppulljqefbvukcpg.supabase.co',
      'https://kong.example.test',
      'not-a-url',
    ]) {
      assert.equal(isLocalSupabaseRuntimeUrl(value), false);
    }
  });

  it('rejects declared and streamed JSON bodies above the shared byte limit', async () => {
    const declared = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Length': String(MAX_JSON_REQUEST_BYTES + 1) },
      body: '{}',
    });
    await assert.rejects(() => parseJson(declared), /too large/u);

    const chunk = new Uint8Array(MAX_JSON_REQUEST_BYTES + 1).fill(32);
    const streamed = new Request('http://localhost/test', {
      method: 'POST',
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(chunk);
          controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);
    await assert.rejects(() => parseJson(streamed), /too large/u);
  });

  it('enforces note length and HTTP-only source URLs', () => {
    const base = {
      originalText: 'A bounded note.',
      captureChannel: 'extension',
      clientRequestId: REQUEST_ID,
    };
    assert.equal(
      captureNoteRequestSchema.safeParse({
        ...base,
        originalText: 'x'.repeat(MAX_NOTE_TEXT_LENGTH + 1),
      }).success,
      false,
    );
    assert.equal(
      captureNoteRequestSchema.safeParse({
        ...base,
        sourceUrl: 'file:///private/note',
      }).success,
      false,
    );
  });

  it('allows only exact configured web and extension origins', async () => {
    const extensionOrigin =
      'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const handler = createHttpHandler(async () => Response.json({ ok: true }), {
      appUrl: 'https://app.example.test/',
      extensionIds: ['abcdefghijklmnopabcdefghijklmnop'],
    });
    for (const origin of ['https://app.example.test', extensionOrigin]) {
      const response = await handler(
        new Request('http://localhost/test', {
          method: 'OPTIONS',
          headers: { Origin: origin },
        }),
      );
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    }
    for (const origin of [
      'https://app.example.test.attacker.invalid',
      'https://app.example.test/',
      'null',
    ]) {
      const response = await handler(
        new Request('http://localhost/test', {
          method: 'OPTIONS',
          headers: { Origin: origin },
        }),
      );
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    }
  });

  it('fails closed for wildcard or path-bearing application URLs', async () => {
    for (const appUrl of ['*', 'https://app.example.test/path']) {
      const handler = createHttpHandler(
        async () => Response.json({ ok: true }),
        { appUrl },
      );
      const response = await handler(
        new Request('http://localhost/test', {
          method: 'OPTIONS',
          headers: { Origin: 'https://app.example.test' },
        }),
      );
      assert.equal(response.status, 403);
    }
  });
});

describe('Phase 7 provider resilience', () => {
  it('retries a safe OpenAI server failure once with fresh timeout signals', async () => {
    let calls = 0;
    const signals: AbortSignal[] = [];
    const provider = new OpenAiProvider(
      'synthetic-key',
      async (_url, init) => {
        calls += 1;
        signals.push(init?.signal as AbortSignal);
        if (calls === 1) return new Response(null, { status: 503 });
        return Response.json({
          data: [{ embedding: [1, ...Array<number>(1_535).fill(0)] }],
        });
      },
      async () => undefined,
    );
    assert.equal((await provider.embed('synthetic input')).length, 1_536);
    assert.equal(calls, 2);
    assert.notEqual(signals[0], signals[1]);
  });

  it('does not repeat a Telegram send after an uncertain failure', async () => {
    let calls = 0;
    const client = new TelegramApiClient(
      'synthetic-token',
      async () => {
        calls += 1;
        return new Response(null, { status: 503 });
      },
      async () => undefined,
    );
    await assert.rejects(() => client.sendMessage(1, 'synthetic'));
    assert.equal(calls, 1);
  });

  it('retries an explicit Telegram rate limit once', async () => {
    let calls = 0;
    const client = new TelegramApiClient(
      'synthetic-token',
      async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(null, {
            status: 429,
            headers: { 'Retry-After': '0' },
          });
        }
        return Response.json({ ok: true, result: {} });
      },
      async () => undefined,
    );
    await client.sendMessage(1, 'synthetic');
    assert.equal(calls, 2);
  });

  it('retries a safe Telegram acknowledgement after a network failure', async () => {
    let calls = 0;
    const client = new TelegramApiClient(
      'synthetic-token',
      async () => {
        calls += 1;
        if (calls === 1) throw new TypeError('synthetic network failure');
        return Response.json({ ok: true, result: {} });
      },
      async () => undefined,
    );
    await client.answerCallbackQuery('synthetic-callback');
    assert.equal(calls, 2);
  });
});

describe('Phase 7 retrieval evaluation harness', () => {
  it('scores a top-five hit and records a miss without query content', () => {
    const value = validateDataset({
      notes: [
        { id: '10000000-0000-4000-8000-000000000001', text: 'alpha' },
        { id: '10000000-0000-4000-8000-000000000002', text: 'beta' },
        { id: '10000000-0000-4000-8000-000000000003', text: 'gamma' },
        { id: '10000000-0000-4000-8000-000000000004', text: 'delta' },
        { id: '10000000-0000-4000-8000-000000000005', text: 'epsilon' },
        { id: '10000000-0000-4000-8000-000000000006', text: 'zeta' },
        { id: '10000000-0000-4000-8000-000000000007', text: 'eta' },
        { id: '10000000-0000-4000-8000-000000000008', text: 'theta' },
        { id: '10000000-0000-4000-8000-000000000009', text: 'iota' },
        { id: '10000000-0000-4000-8000-000000000010', text: 'kappa' },
        { id: '10000000-0000-4000-8000-000000000011', text: 'lambda' },
        { id: '10000000-0000-4000-8000-000000000012', text: 'mu' },
        { id: '10000000-0000-4000-8000-000000000013', text: 'nu' },
        { id: '10000000-0000-4000-8000-000000000014', text: 'xi' },
        { id: '10000000-0000-4000-8000-000000000015', text: 'omicron' },
      ],
      queries: Array.from({ length: 30 }, (_unused, index) => ({
        query: `query ${index}`,
        expectedNoteIds: [
          index === 29
            ? '10000000-0000-4000-8000-000000000015'
            : '10000000-0000-4000-8000-000000000001',
        ],
      })),
    });
    const noteEmbeddings = Array.from({ length: 15 }, (_unused, index) => [
      1,
      index / 10,
    ]);
    const queryEmbeddings = Array.from({ length: 30 }, () => [1, 0]);
    const result = scoreEvaluation(value, [
      ...noteEmbeddings,
      ...queryEmbeddings,
    ]);
    assert.equal(cosine([1, 0], [1, 0]), 1);
    assert.equal(result.topFiveHits, 29);
    assert.equal(result.failures.length, 1);
    assert.equal('query' in result.failures[0], false);
    assert.equal(result.failures[0].taxonomy, 'unclassified');
  });
});
