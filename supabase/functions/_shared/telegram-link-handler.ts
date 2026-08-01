import {
  telegramLinkCodeRequestSchema,
  telegramLinkCodeResponseSchema,
} from '../../../packages/shared/src/contracts/index.ts';
import { TELEGRAM_LINK_CODE_LENGTH } from '../../../packages/shared/src/constants/index.ts';
import { ApiError } from './errors.ts';
import { parseJson } from './http.ts';
import type { Authenticator } from './types.ts';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface TelegramLinkRepository {
  createTelegramLinkCode(
    codeHash: string,
  ): Promise<{ expiresAt: string; connected: boolean }>;
}

export interface TelegramLinkDependencies {
  authenticator: Authenticator;
  repository: TelegramLinkRepository;
  randomBytes?: (length: number) => Uint8Array;
}

function secureRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function generateTelegramLinkCode(
  randomBytes: (length: number) => Uint8Array = secureRandomBytes,
): string {
  const bytes = randomBytes(TELEGRAM_LINK_CODE_LENGTH);
  if (bytes.length !== TELEGRAM_LINK_CODE_LENGTH) {
    throw new Error('Link-code entropy source returned an invalid length.');
  }
  return Array.from(
    bytes,
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join('');
}

export async function hashTelegramLinkCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(code),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function handleTelegramLinkCode(
  request: Request,
  dependencies: TelegramLinkDependencies,
): Promise<Response> {
  await dependencies.authenticator.authenticate(request);
  const body = telegramLinkCodeRequestSchema.safeParse(
    await parseJson(request),
  );
  if (!body.success) {
    throw new ApiError(400, 'bad_request', 'Link-code request is invalid.');
  }

  const code = generateTelegramLinkCode(dependencies.randomBytes);
  const codeHash = await hashTelegramLinkCode(code);
  const result = await dependencies.repository.createTelegramLinkCode(codeHash);

  return Response.json(
    telegramLinkCodeResponseSchema.parse({
      code,
      expiresAt: result.expiresAt,
      connected: result.connected,
    }),
  );
}
