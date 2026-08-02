import type {
  CaptureNoteRequest,
  Enrichment,
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
  noteType: Enrichment['noteType'];
  summary: string;
  tags: string[];
  firstReviewDate: string;
  created: boolean;
}

export type AtomicCaptureInput = Omit<CaptureNoteRequest, 'noteType'> &
  Enrichment & {
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
  enrich(input: {
    originalText: string;
    personalContext?: string;
    requestedNoteType?: CaptureNoteRequest['noteType'];
  }): Promise<Enrichment>;
  embed(input: string): Promise<number[]>;
  synthesize(input: {
    query: string;
    matches: SearchMatch[];
  }): Promise<SynthesisClaim[]>;
}
