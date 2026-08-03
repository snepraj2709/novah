import type {
  ManagePracticeRequest,
  ManagePracticeResponse,
  PracticeEntry,
  PracticeState,
} from './contracts.ts';

export type PracticeLifecycleRequest = Exclude<
  ManagePracticeRequest,
  { action: 'addEntry' }
>;

export interface PracticeRepository {
  managePractice(request: PracticeLifecycleRequest): Promise<PracticeState>;
  addEntry(
    noteId: string,
    entryKind: PracticeEntry['kind'],
    text: string,
  ): Promise<{ practice: PracticeState; entry: PracticeEntry }>;
}

export type PracticeMutationResult = ManagePracticeResponse;
