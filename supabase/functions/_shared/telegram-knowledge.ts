import {
  captureNoteResponseSchema,
  searchNotesResponseSchema,
  type CaptureNoteRequest,
  type CaptureNoteResponse,
  type SearchNotesRequest,
  type SearchNotesResponse,
} from './contracts.ts';
import { handleCaptureNote } from './capture-handler.ts';
import { handleSearchNotes } from './search-handler.ts';
import type { AiProvider, Authenticator, NoteRepository } from './types.ts';
import type { TelegramKnowledgeService } from './telegram-types.ts';

export interface NoteRepositoryFactory {
  noteRepository(userId: string): NoteRepository;
}

function internalRequest(body: unknown): Request {
  return new Request('http://internal.novah/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function internalAuthenticator(userId: string): Authenticator {
  return {
    async authenticate() {
      return { id: userId };
    },
  };
}

export class TelegramKnowledgePipeline implements TelegramKnowledgeService {
  private readonly repositories: NoteRepositoryFactory;
  private readonly ai: AiProvider;

  constructor(repositories: NoteRepositoryFactory, ai: AiProvider) {
    this.repositories = repositories;
    this.ai = ai;
  }

  async capture(
    userId: string,
    request: CaptureNoteRequest,
  ): Promise<CaptureNoteResponse> {
    const response = await handleCaptureNote(internalRequest(request), {
      authenticator: internalAuthenticator(userId),
      repository: this.repositories.noteRepository(userId),
      ai: this.ai,
    });
    return captureNoteResponseSchema.parse(await response.json());
  }

  async search(
    userId: string,
    request: SearchNotesRequest,
  ): Promise<SearchNotesResponse> {
    const response = await handleSearchNotes(internalRequest(request), {
      authenticator: internalAuthenticator(userId),
      repository: this.repositories.noteRepository(userId),
      ai: this.ai,
    });
    return searchNotesResponseSchema.parse(await response.json());
  }
}
