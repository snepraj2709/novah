import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleCaptureNote } from '../_shared/capture-handler.ts';
import { renderGroundedSynthesis } from '../_shared/citations.ts';
import { createHttpHandler } from '../_shared/http.ts';
import { OpenAiProvider } from '../_shared/openai.ts';
import { handleSearchNotes } from '../_shared/search-handler.ts';
import type {
  AiProvider,
  AtomicCaptureInput,
  Authenticator,
  NoteRepository,
  StoredCapture,
} from '../_shared/types.ts';
import type { Classification, SearchMatch } from '../_shared/contracts.ts';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const NOTE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_NOTE_ID = '33333333-3333-4333-8333-333333333333';
const EMBEDDING = Array.from({ length: 1_536 }, (_, index) =>
  index === 0 ? 1 : 0,
);

const authenticator: Authenticator = {
  async authenticate() {
    return { id: USER_ID };
  },
};

const classification: Classification = { noteType: 'lesson' };

class Repository implements NoteRepository {
  existing: StoredCapture | null = null;
  captures: AtomicCaptureInput[] = [];
  matches: SearchMatch[] = [];
  findCalls = 0;

  async findByClientRequestId(): Promise<StoredCapture | null> {
    this.findCalls += 1;
    return this.existing;
  }

  async captureAtomic(input: AtomicCaptureInput): Promise<StoredCapture> {
    this.captures.push(input);
    return {
      id: NOTE_ID,
      originalText: input.originalText,
      noteType: input.noteType,
      firstReviewDate: '2026-08-02',
      created: true,
    };
  }

  async matchNotes(): Promise<SearchMatch[]> {
    return this.matches;
  }
}

class Ai implements AiProvider {
  classifyCalls = 0;
  embedCalls = 0;
  embedInputs: string[] = [];
  synthesizeCalls = 0;
  synthesis = [
    { text: 'The note distinguishes imagined suffering.', noteIds: [NOTE_ID] },
  ];

  async classify(): Promise<Classification> {
    this.classifyCalls += 1;
    return structuredClone(classification);
  }

  async embed(input: string): Promise<number[]> {
    this.embedCalls += 1;
    this.embedInputs.push(input);
    return EMBEDDING;
  }

  async synthesize() {
    this.synthesizeCalls += 1;
    return this.synthesis;
  }
}

function post(body: unknown, headers: HeadersInit = {}): Request {
  return new Request('http://localhost/functions/v1/test', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer synthetic-token',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function captureBody() {
  return {
    originalText: '  We suffer more often\nin imagination than in reality.  ',
    personalContext: '  Separate imagined risk from present risk. ',
    noteType: 'quote',
    sourceTitle: ' Letters from a Stoic ',
    sourceUrl: 'https://example.invalid/source',
    captureChannel: 'extension',
    clientRequestId: REQUEST_ID,
  };
}

function match(noteId = NOTE_ID, similarity = 0.9): SearchMatch {
  return {
    noteId,
    originalText: 'We suffer more often in imagination than in reality.',
    personalContext: 'Separate imagined risk from present risk.',
    noteType: 'quote',
    sourceTitle: 'Letters from a Stoic',
    sourceUrl: 'https://example.invalid/source',
    capturedAt: '2026-08-01T12:00:00.000Z',
    similarity,
  };
}

describe('capture-note', () => {
  it('uses an explicit type without classification and embeds only canonical note input', async () => {
    const repository = new Repository();
    const ai = new Ai();
    const response = await handleCaptureNote(post(captureBody()), {
      authenticator,
      repository,
      ai,
    });
    assert.equal(response.status, 200);
    assert.equal(repository.captures.length, 1);
    assert.equal(
      repository.captures[0].originalText,
      'We suffer more often in imagination than in reality.',
    );
    assert.equal(
      repository.captures[0].personalContext,
      'Separate imagined risk from present risk.',
    );
    assert.equal(repository.captures[0].noteType, 'quote');
    assert.equal(ai.classifyCalls, 0);
    assert.equal(ai.embedCalls, 1);
    assert.equal(
      ai.embedInputs[0],
      JSON.stringify({
        originalText: 'We suffer more often in imagination than in reality.',
        personalContext: 'Separate imagined risk from present risk.',
        sourceTitle: 'Letters from a Stoic',
      }),
    );
    assert.equal('summary' in repository.captures[0], false);
    assert.equal('tags' in repository.captures[0], false);
    assert.equal('recallPrompt' in repository.captures[0], false);
    const payload = await response.json();
    assert.deepEqual(Object.keys(payload.note).sort(), [
      'firstReviewDate',
      'id',
      'noteType',
      'originalText',
    ]);
  });

  it('classifies an omitted type exactly once before one embedding', async () => {
    const repository = new Repository();
    const ai = new Ai();
    const { noteType: _noteType, ...body } = captureBody();
    const response = await handleCaptureNote(post(body), {
      authenticator,
      repository,
      ai,
    });
    assert.equal(response.status, 200);
    assert.equal(ai.classifyCalls, 1);
    assert.equal(ai.embedCalls, 1);
    assert.equal(repository.captures[0].noteType, 'lesson');
  });

  it('authenticates before parsing or calling providers', async () => {
    const repository = new Repository();
    const ai = new Ai();
    await assert.rejects(
      () =>
        handleCaptureNote(post({ originalText: '   ' }), {
          authenticator: {
            async authenticate() {
              throw new Error('synthetic authentication failure');
            },
          },
          repository,
          ai,
        }),
      /authentication failure/u,
    );
    assert.equal(repository.findCalls, 0);
    assert.equal(ai.classifyCalls, 0);
    assert.equal(ai.embedCalls, 0);
  });

  it('returns an existing idempotent capture without another AI request', async () => {
    const repository = new Repository();
    repository.existing = {
      id: NOTE_ID,
      originalText: 'Stored original.',
      noteType: 'lesson',
      firstReviewDate: '2026-08-02',
      created: false,
    };
    const ai = new Ai();
    const response = await handleCaptureNote(post(captureBody()), {
      authenticator,
      repository,
      ai,
    });
    assert.equal(response.status, 200);
    assert.equal(ai.classifyCalls, 0);
    assert.equal(ai.embedCalls, 0);
    assert.equal(repository.captures.length, 0);
    assert.equal((await response.json()).note.id, NOTE_ID);
  });

  it('returns a retryable error and writes nothing when classification fails', async () => {
    const repository = new Repository();
    const ai = new Ai();
    ai.classify = async () => {
      throw new Error('synthetic model failure');
    };
    const { noteType: _noteType, ...body } = captureBody();
    await assert.rejects(
      () =>
        handleCaptureNote(post(body), {
          authenticator,
          repository,
          ai,
        }),
      (error: unknown) =>
        error instanceof Error &&
        'retryable' in error &&
        error.retryable === true,
    );
    assert.equal(repository.captures.length, 0);
  });

  it('returns a retryable error and writes nothing when embedding fails', async () => {
    const repository = new Repository();
    const ai = new Ai();
    ai.embed = async () => {
      throw new Error('synthetic embedding failure');
    };
    await assert.rejects(
      () =>
        handleCaptureNote(post(captureBody()), {
          authenticator,
          repository,
          ai,
        }),
      (error: unknown) =>
        error instanceof Error &&
        'retryable' in error &&
        error.retryable === true,
    );
    assert.equal(repository.captures.length, 0);
  });

  it('rejects wrong-length and non-finite embeddings before persistence', async (context) => {
    for (const [name, invalidEmbedding] of [
      ['wrong length', EMBEDDING.slice(1)],
      ['non-finite value', [Number.NaN, ...EMBEDDING.slice(1)]],
    ] as const) {
      await context.test(name, async () => {
        const repository = new Repository();
        const ai = new Ai();
        ai.embed = async () => invalidEmbedding;
        await assert.rejects(
          () =>
            handleCaptureNote(post(captureBody()), {
              authenticator,
              repository,
              ai,
            }),
          (error: unknown) =>
            error instanceof Error &&
            'retryable' in error &&
            error.retryable === true,
        );
        assert.equal(repository.captures.length, 0);
      });
    }
  });

  it('rejects invalid capture input before AI or persistence', async () => {
    const repository = new Repository();
    const ai = new Ai();
    await assert.rejects(
      () =>
        handleCaptureNote(
          post({ ...captureBody(), sourceUrl: 'file:///private/note' }),
          { authenticator, repository, ai },
        ),
      /invalid/u,
    );
    assert.equal(ai.classifyCalls, 0);
    assert.equal(ai.embedCalls, 0);
    assert.equal(repository.findCalls, 0);
    assert.equal(repository.captures.length, 0);
  });
});

describe('search-notes', () => {
  it('withholds synthesis when retrieval is weak', async () => {
    const repository = new Repository();
    repository.matches = [match(NOTE_ID, 0.2)];
    const ai = new Ai();
    const response = await handleSearchNotes(
      post({ query: 'unrelated query', limit: 8 }),
      { authenticator, repository, ai },
    );
    const payload = await response.json();
    assert.equal(payload.synthesisWithheld, true);
    assert.equal(payload.answer, null);
    assert.deepEqual(payload.citations, []);
    assert.equal(ai.synthesizeCalls, 0);
  });

  it('maps every synthesis citation to an actual returned note ID', async () => {
    const repository = new Repository();
    repository.matches = [match(), match(OTHER_NOTE_ID, 0.8)];
    const ai = new Ai();
    ai.synthesis = [
      {
        text: 'Two stored notes support this.',
        noteIds: [NOTE_ID, OTHER_NOTE_ID],
      },
    ];
    const response = await handleSearchNotes(post({ query: 'decision risk' }), {
      authenticator,
      repository,
      ai,
    });
    const payload = await response.json();
    assert.equal(payload.synthesisWithheld, false);
    assert.equal(payload.answer, 'Two stored notes support this. [1][2]');
    assert.deepEqual(payload.citations, [
      { number: 1, noteId: NOTE_ID },
      { number: 2, noteId: OTHER_NOTE_ID },
    ]);
  });

  it('withholds an answer if the model cites a note outside retrieval', async () => {
    const repository = new Repository();
    repository.matches = [match()];
    const ai = new Ai();
    ai.synthesis = [{ text: 'Unsupported claim.', noteIds: [OTHER_NOTE_ID] }];
    const response = await handleSearchNotes(post({ query: 'decision risk' }), {
      authenticator,
      repository,
      ai,
    });
    const payload = await response.json();
    assert.equal(payload.synthesisWithheld, true);
    assert.equal(payload.answer, null);
    assert.deepEqual(payload.citations, []);
  });
});

describe('shared infrastructure', () => {
  it('exposes a strict classification-only schema', async () => {
    const contracts = (await import('../_shared/contracts.ts')) as Record<
      string,
      unknown
    >;
    assert.equal(typeof contracts.classificationSchema, 'object');
    const schema = contracts.classificationSchema as {
      safeParse(value: unknown): { success: boolean };
    };
    assert.equal(schema.safeParse({ noteType: 'lesson' }).success, true);
    assert.equal(
      schema.safeParse({ noteType: 'lesson', summary: 'not allowed' }).success,
      false,
    );
  });

  it('accepts only a metadata-free capture response contract', async () => {
    const contracts = (await import('../_shared/contracts.ts')) as Record<
      string,
      { safeParse(value: unknown): { success: boolean } }
    >;
    assert.equal(
      contracts.captureNoteResponseSchema.safeParse({
        note: {
          id: NOTE_ID,
          originalText: 'Stored original.',
          noteType: 'lesson',
          firstReviewDate: '2026-08-02',
        },
      }).success,
      true,
    );
  });

  it('accepts only metadata-free search matches', async () => {
    const contracts = (await import('../_shared/contracts.ts')) as Record<
      string,
      { safeParse(value: unknown): { success: boolean } }
    >;
    assert.equal(
      contracts.searchNotesResponseSchema.safeParse({
        answer: null,
        citations: [],
        matches: [
          {
            noteId: NOTE_ID,
            originalText: 'Stored original.',
            personalContext: null,
            noteType: 'lesson',
            sourceTitle: null,
            sourceUrl: null,
            capturedAt: '2026-08-01T12:00:00.000Z',
            similarity: 0.2,
          },
        ],
        synthesisWithheld: true,
      }).success,
      true,
    );
  });

  it('rejects an unlisted browser origin and permits the configured extension', async () => {
    const handler = createHttpHandler(async () => Response.json({ ok: true }), {
      extensionIds: ['abcdefghijklmnopabcdefghijklmnop'],
    });
    const denied = await handler(
      post({}, { Origin: 'https://attacker.invalid' }),
    );
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
    const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const allowed = await handler(post({}, { Origin: origin }));
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), origin);
  });

  it('uses supported strict schemas with store false', async () => {
    const requestBodies: Record<string, unknown>[] = [];
    const provider = new OpenAiProvider('synthetic-key', async (_url, init) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      return Response.json({
        output: [
          { content: [{ type: 'output_text', text: '{"noteType":"lesson"}' }] },
        ],
      });
    });
    const classify = (
      provider as unknown as {
        classify?: (input: { originalText: string }) => Promise<unknown>;
      }
    ).classify;
    assert.equal(typeof classify, 'function');
    await classify!.call(provider, { originalText: 'Synthetic note.' });
    await assert.rejects(
      () =>
        provider.synthesize({
          query: 'Synthetic query.',
          matches: [match()],
        }),
      /temporarily unavailable/u,
    );
    assert.equal(requestBodies.length, 2);
    assert.equal(
      requestBodies.every((body) => body.store === false),
      true,
    );
    assert.equal(
      requestBodies.every(
        (body) => !JSON.stringify(body).includes('uniqueItems'),
      ),
      true,
    );
    const classificationBody = requestBodies[0] as {
      max_output_tokens?: number;
      text?: {
        format?: {
          name?: string;
          schema?: { required?: string[]; properties?: object };
        };
      };
    };
    assert.ok((classificationBody.max_output_tokens ?? Infinity) <= 200);
    assert.equal(
      classificationBody.text?.format?.name,
      'capture_classification',
    );
    assert.deepEqual(classificationBody.text?.format?.schema?.required, [
      'noteType',
    ]);
    assert.deepEqual(
      Object.keys(classificationBody.text?.format?.schema?.properties ?? {}),
      ['noteType'],
    );
  });

  it('does not render empty or ungrounded citation sets', () => {
    assert.equal(renderGroundedSynthesis([], [match()]), null);
    assert.equal(
      renderGroundedSynthesis(
        [{ text: 'Claim', noteIds: [OTHER_NOTE_ID] }],
        [match()],
      ),
      null,
    );
  });
});
