import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../packages/shared/src/types/database.ts';
import { ApiError } from './errors.ts';
import type { AccountDeletionRepository } from './account-deletion-handler.ts';

export class SupabaseAccountDeletionRepository implements AccountDeletionRepository {
  private readonly client: SupabaseClient<Database>;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient<Database>(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async deleteUser(userId: string): Promise<void> {
    const { error } = await this.client.auth.admin.deleteUser(userId, false);
    if (error) {
      throw new ApiError(
        500,
        'internal_error',
        'Account deletion could not be completed.',
        true,
      );
    }
  }
}
