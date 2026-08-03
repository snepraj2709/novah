import type {
  CaptureNoteRequest,
  Classification,
  SearchMatch,
} from './contracts.ts';

export interface AuthenticatedUser {
  id: string;
  passwordAuthenticatedAt?: string;
}

export interface Authenticator {
  authenticate(request: Request): Promise<AuthenticatedUser>;
}

export interface StoredCapture {
  id: string;
  originalText: string;
  noteType: Classification['noteType'];
  created: boolean;
}

export type AtomicCaptureInput = Omit<CaptureNoteRequest, 'noteType'> &
  Classification & {
    embedding: number[];
  };

export interface NoteRepository {
  findByClientRequestId(clientRequestId: string): Promise<StoredCapture | null>;
  captureAtomic(input: AtomicCaptureInput): Promise<StoredCapture>;
  matchNotes(
    queryEmbedding: number[],
    matchCount: number,
  ): Promise<SearchMatch[]>;
}

export interface SynthesisClaim {
  text: string;
  noteIds: string[];
}

export interface AiProvider {
  classify(input: {
    originalText: string;
    personalContext?: string;
  }): Promise<Classification>;
  embed(input: string): Promise<number[]>;
  synthesize(input: {
    query: string;
    matches: SearchMatch[];
  }): Promise<SynthesisClaim[]>;
}
