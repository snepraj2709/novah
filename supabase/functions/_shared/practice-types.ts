import type {
  ManagePracticeResponse,
  PracticeEntry,
  PracticeState,
} from './contracts.ts';

export type SupportedPracticeAction = 'activate' | 'reread';

export interface PracticeRepository {
  managePractice(
    action: SupportedPracticeAction,
    noteId: string,
  ): Promise<PracticeState>;
  addEntry(
    noteId: string,
    entryKind: PracticeEntry['kind'],
    text: string,
  ): Promise<{ practice: PracticeState; entry: PracticeEntry }>;
}

export type PracticeMutationResult = ManagePracticeResponse;
