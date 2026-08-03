import type { ManagePracticeResponse, PracticeState } from './contracts.ts';

export type SupportedPracticeAction = 'activate' | 'reread';

export interface PracticeRepository {
  managePractice(
    action: SupportedPracticeAction,
    noteId: string,
  ): Promise<PracticeState>;
}

export type PracticeMutationResult = ManagePracticeResponse;
