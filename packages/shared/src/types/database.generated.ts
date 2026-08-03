export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      daily_digests: {
        Row: {
          content: Json;
          created_at: string;
          digest_date: string;
          id: string;
          note_ids: string[];
          sent_at: string | null;
          user_id: string;
        };
        Insert: {
          content: Json;
          created_at?: string;
          digest_date: string;
          id?: string;
          note_ids?: string[];
          sent_at?: string | null;
          user_id: string;
        };
        Update: {
          content?: Json;
          created_at?: string;
          digest_date?: string;
          id?: string;
          note_ids?: string[];
          sent_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_digests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      note_practices: {
        Row: {
          active_notification_claimed_at: string | null;
          active_notification_sent_on: string | null;
          check_in_notification_claimed_at: string | null;
          check_in_notification_sent_on: string | null;
          check_ins_enabled: boolean;
          created_at: string;
          integrated_at: string | null;
          interval_days: number;
          last_practised_at: string | null;
          next_check_in_on: string | null;
          next_due_on: string | null;
          note_id: string;
          paused_until: string | null;
          ready_to_resume: boolean;
          status: Database['public']['Enums']['practice_status'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active_notification_claimed_at?: string | null;
          active_notification_sent_on?: string | null;
          check_in_notification_claimed_at?: string | null;
          check_in_notification_sent_on?: string | null;
          check_ins_enabled?: boolean;
          created_at?: string;
          integrated_at?: string | null;
          interval_days?: number;
          last_practised_at?: string | null;
          next_check_in_on?: string | null;
          next_due_on?: string | null;
          note_id: string;
          paused_until?: string | null;
          ready_to_resume?: boolean;
          status: Database['public']['Enums']['practice_status'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active_notification_claimed_at?: string | null;
          active_notification_sent_on?: string | null;
          check_in_notification_claimed_at?: string | null;
          check_in_notification_sent_on?: string | null;
          check_ins_enabled?: boolean;
          created_at?: string;
          integrated_at?: string | null;
          interval_days?: number;
          last_practised_at?: string | null;
          next_check_in_on?: string | null;
          next_due_on?: string | null;
          note_id?: string;
          paused_until?: string | null;
          ready_to_resume?: boolean;
          status?: Database['public']['Enums']['practice_status'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'note_practices_owned_note_fk';
            columns: ['note_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'notes';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'note_practices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      notes: {
        Row: {
          capture_channel: Database['public']['Enums']['capture_channel'];
          captured_at: string;
          client_request_id: string;
          created_at: string;
          embedding: string | null;
          id: string;
          note_type: Database['public']['Enums']['note_type'];
          original_text: string;
          personal_context: string | null;
          recall_prompt: string | null;
          source_title: string | null;
          source_url: string | null;
          summary: string | null;
          tags: string[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          capture_channel: Database['public']['Enums']['capture_channel'];
          captured_at?: string;
          client_request_id: string;
          created_at?: string;
          embedding?: string | null;
          id?: string;
          note_type: Database['public']['Enums']['note_type'];
          original_text: string;
          personal_context?: string | null;
          recall_prompt?: string | null;
          source_title?: string | null;
          source_url?: string | null;
          summary?: string | null;
          tags?: string[];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          capture_channel?: Database['public']['Enums']['capture_channel'];
          captured_at?: string;
          client_request_id?: string;
          created_at?: string;
          embedding?: string | null;
          id?: string;
          note_type?: Database['public']['Enums']['note_type'];
          original_text?: string;
          personal_context?: string | null;
          recall_prompt?: string | null;
          source_title?: string | null;
          source_url?: string | null;
          summary?: string | null;
          tags?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      practice_entries: {
        Row: {
          created_at: string;
          id: string;
          kind: Database['public']['Enums']['practice_entry_kind'];
          note_id: string;
          source_channel: Database['public']['Enums']['practice_source_channel'];
          text: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: Database['public']['Enums']['practice_entry_kind'];
          note_id: string;
          source_channel: Database['public']['Enums']['practice_source_channel'];
          text: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: Database['public']['Enums']['practice_entry_kind'];
          note_id?: string;
          source_channel?: Database['public']['Enums']['practice_source_channel'];
          text?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'practice_entries_owned_note_fk';
            columns: ['note_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'notes';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'practice_entries_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      practice_events: {
        Row: {
          created_at: string;
          event_kind: Database['public']['Enums']['practice_event_kind'];
          id: string;
          local_date: string;
          metadata: Json;
          note_id: string;
          occurred_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_kind: Database['public']['Enums']['practice_event_kind'];
          id?: string;
          local_date: string;
          metadata?: Json;
          note_id: string;
          occurred_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_kind?: Database['public']['Enums']['practice_event_kind'];
          id?: string;
          local_date?: string;
          metadata?: Json;
          note_id?: string;
          occurred_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'practice_events_owned_note_fk';
            columns: ['note_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'notes';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'practice_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      processed_telegram_updates: {
        Row: {
          processed_at: string;
          update_id: number;
        };
        Insert: {
          processed_at?: string;
          update_id: number;
        };
        Update: {
          processed_at?: string;
          update_id?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          digest_time: string;
          last_practice_interval_days: number;
          practice_time: string;
          telegram_chat_id: number | null;
          timezone: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          digest_time?: string;
          last_practice_interval_days?: number;
          practice_time?: string;
          telegram_chat_id?: number | null;
          timezone?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          digest_time?: string;
          last_practice_interval_days?: number;
          practice_time?: string;
          telegram_chat_id?: number | null;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      review_events: {
        Row: {
          answered_at: string | null;
          created_at: string;
          delivery_claimed_at: string | null;
          due_on: string;
          id: string;
          note_id: string;
          sent_at: string | null;
          stage: number;
          status: Database['public']['Enums']['review_status'];
          user_id: string;
        };
        Insert: {
          answered_at?: string | null;
          created_at?: string;
          delivery_claimed_at?: string | null;
          due_on: string;
          id?: string;
          note_id: string;
          sent_at?: string | null;
          stage: number;
          status?: Database['public']['Enums']['review_status'];
          user_id: string;
        };
        Update: {
          answered_at?: string | null;
          created_at?: string;
          delivery_claimed_at?: string | null;
          due_on?: string;
          id?: string;
          note_id?: string;
          sent_at?: string | null;
          stage?: number;
          status?: Database['public']['Enums']['review_status'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'review_events_owned_note_fk';
            columns: ['note_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'notes';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'review_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      telegram_link_codes: {
        Row: {
          code_hash: string;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          code_hash: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          user_id: string;
        };
        Update: {
          code_hash?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'telegram_link_codes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      telegram_reply_prompts: {
        Row: {
          chat_id: number;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          intent: Database['public']['Enums']['telegram_reply_intent'];
          note_id: string;
          prompt_message_id: number;
          user_id: string;
        };
        Insert: {
          chat_id: number;
          consumed_at?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          intent: Database['public']['Enums']['telegram_reply_intent'];
          note_id: string;
          prompt_message_id: number;
          user_id: string;
        };
        Update: {
          chat_id?: number;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          intent?: Database['public']['Enums']['telegram_reply_intent'];
          note_id?: string;
          prompt_message_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'telegram_reply_prompts_owned_note_fk';
            columns: ['note_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'notes';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'telegram_reply_prompts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_practice_entry: {
        Args: {
          input_kind: Database['public']['Enums']['practice_entry_kind'];
          input_note_id: string;
          input_text: string;
        };
        Returns: {
          check_ins_enabled: boolean;
          entry_created_at: string;
          entry_id: string;
          entry_kind: Database['public']['Enums']['practice_entry_kind'];
          entry_source_channel: Database['public']['Enums']['practice_source_channel'];
          entry_text: string;
          integrated_at: string;
          interval_days: number;
          last_practised_at: string;
          next_check_in_on: string;
          next_due_on: string;
          note_id: string;
          paused_until: string;
          ready_to_resume: boolean;
          status: Database['public']['Enums']['practice_status'];
        }[];
      };
      add_practice_entry_core: {
        Args: {
          input_kind: Database['public']['Enums']['practice_entry_kind'];
          input_note_id: string;
          input_now?: string;
          input_source_channel: Database['public']['Enums']['practice_source_channel'];
          input_text: string;
          input_user_id: string;
        };
        Returns: {
          check_ins_enabled: boolean;
          entry_created_at: string;
          entry_id: string;
          entry_kind: Database['public']['Enums']['practice_entry_kind'];
          entry_source_channel: Database['public']['Enums']['practice_source_channel'];
          entry_text: string;
          integrated_at: string;
          interval_days: number;
          last_practised_at: string;
          next_check_in_on: string;
          next_due_on: string;
          note_id: string;
          paused_until: string;
          ready_to_resume: boolean;
          status: Database['public']['Enums']['practice_status'];
        }[];
      };
      add_practice_entry_for_user: {
        Args: {
          input_kind: Database['public']['Enums']['practice_entry_kind'];
          input_note_id: string;
          input_source_channel: Database['public']['Enums']['practice_source_channel'];
          input_text: string;
          input_user_id: string;
        };
        Returns: {
          check_ins_enabled: boolean;
          entry_created_at: string;
          entry_id: string;
          entry_kind: Database['public']['Enums']['practice_entry_kind'];
          entry_source_channel: Database['public']['Enums']['practice_source_channel'];
          entry_text: string;
          integrated_at: string;
          interval_days: number;
          last_practised_at: string;
          next_check_in_on: string;
          next_due_on: string;
          note_id: string;
          paused_until: string;
          ready_to_resume: boolean;
          status: Database['public']['Enums']['practice_status'];
        }[];
      };
      are_normalized_tags: { Args: { input_tags: string[] }; Returns: boolean };
      capture_note_atomic: {
        Args: {
          input_capture_channel: Database['public']['Enums']['capture_channel'];
          input_client_request_id: string;
          input_embedding: string;
          input_note_type: Database['public']['Enums']['note_type'];
          input_original_text: string;
          input_personal_context: string;
          input_recall_prompt: string;
          input_source_title: string;
          input_source_url: string;
          input_summary: string;
          input_tags: string[];
        };
        Returns: {
          created: boolean;
          note_id: string;
          stored_note_type: Database['public']['Enums']['note_type'];
          stored_original_text: string;
          stored_summary: string;
          stored_tags: string[];
        }[];
      };
      capture_note_atomic_for_user: {
        Args: {
          input_capture_channel: Database['public']['Enums']['capture_channel'];
          input_client_request_id: string;
          input_embedding: string;
          input_note_type: Database['public']['Enums']['note_type'];
          input_original_text: string;
          input_personal_context: string;
          input_recall_prompt: string;
          input_source_title: string;
          input_source_url: string;
          input_summary: string;
          input_tags: string[];
          input_user_id: string;
        };
        Returns: {
          created: boolean;
          note_id: string;
          stored_note_type: Database['public']['Enums']['note_type'];
          stored_original_text: string;
          stored_summary: string;
          stored_tags: string[];
        }[];
      };
      claim_daily_digest: {
        Args: {
          input_content: Json;
          input_digest_date: string;
          input_note_ids: string[];
          input_user_id: string;
        };
        Returns: string;
      };
      claim_due_practices: {
        Args: {
          input_claimed_at: string;
          input_local_date: string;
          input_user_id: string;
        };
        Returns: {
          next_due_on: string;
          note_id: string;
          original_text: string;
          source_title: string;
        }[];
      };
      claim_due_reviews: {
        Args: {
          input_claimed_at?: string;
          input_local_date: string;
          input_user_id: string;
        };
        Returns: {
          event_id: string;
          note_id: string;
          recall_prompt: string;
          source_title: string;
          stage: number;
        }[];
      };
      configure_notification_cron: {
        Args: { input_cron_secret: string };
        Returns: number;
      };
      consume_telegram_link_code: {
        Args: { input_chat_id: number; input_code_hash: string };
        Returns: string;
      };
      consume_telegram_practice_reply: {
        Args: {
          input_chat_id: number;
          input_now?: string;
          input_prompt_message_id: number;
          input_source_channel: Database['public']['Enums']['practice_source_channel'];
          input_text: string;
          input_user_id: string;
        };
        Returns: {
          check_ins_enabled: boolean;
          entry_created_at: string;
          entry_id: string;
          entry_kind: Database['public']['Enums']['practice_entry_kind'];
          entry_source_channel: Database['public']['Enums']['practice_source_channel'];
          entry_text: string;
          integrated_at: string;
          interval_days: number;
          last_practised_at: string;
          next_check_in_on: string;
          next_due_on: string;
          note_id: string;
          paused_until: string;
          ready_to_resume: boolean;
          status: Database['public']['Enums']['practice_status'];
        }[];
      };
      create_telegram_link_code: {
        Args: { input_code_hash: string };
        Returns: {
          connected: boolean;
          expires_at: string;
        }[];
      };
      create_telegram_reply_prompt: {
        Args: {
          input_chat_id: number;
          input_intent: Database['public']['Enums']['telegram_reply_intent'];
          input_note_id: string;
          input_now?: string;
          input_prompt_message_id: number;
          input_user_id: string;
        };
        Returns: string;
      };
      inspect_telegram_reply_prompt: {
        Args: {
          input_chat_id: number;
          input_now?: string;
          input_prompt_message_id: number;
          input_user_id: string;
        };
        Returns: Database['public']['Enums']['telegram_reply_intent'];
      };
      is_http_url: { Args: { input_url: string }; Returns: boolean };
      is_valid_timezone: { Args: { timezone_name: string }; Returns: boolean };
      manage_practice: {
        Args: { input_action: string; input_note_id: string };
        Returns: {
          check_ins_enabled: boolean;
          integrated_at: string;
          interval_days: number;
          last_practised_at: string;
          next_check_in_on: string;
          next_due_on: string;
          note_id: string;
          paused_until: string;
          ready_to_resume: boolean;
          status: Database['public']['Enums']['practice_status'];
        }[];
      };
      manage_practice_core: {
        Args: {
          input_action: string;
          input_note_id: string;
          input_now?: string;
          input_user_id: string;
        };
        Returns: {
          check_ins_enabled: boolean;
          integrated_at: string;
          interval_days: number;
          last_practised_at: string;
          next_check_in_on: string;
          next_due_on: string;
          note_id: string;
          paused_until: string;
          ready_to_resume: boolean;
          status: Database['public']['Enums']['practice_status'];
        }[];
      };
      manage_practice_for_user: {
        Args: {
          input_action: string;
          input_note_id: string;
          input_user_id: string;
        };
        Returns: {
          check_ins_enabled: boolean;
          integrated_at: string;
          interval_days: number;
          last_practised_at: string;
          next_check_in_on: string;
          next_due_on: string;
          note_id: string;
          paused_until: string;
          ready_to_resume: boolean;
          status: Database['public']['Enums']['practice_status'];
        }[];
      };
      mark_daily_digest_sent: {
        Args: { input_digest_id: string; input_sent_at?: string };
        Returns: boolean;
      };
      mark_practice_notification_sent: {
        Args: {
          input_local_date: string;
          input_note_id: string;
          input_sent_at: string;
          input_user_id: string;
        };
        Returns: boolean;
      };
      mark_review_packet_sent: {
        Args: { input_event_ids: string[]; input_sent_at?: string };
        Returns: number;
      };
      match_notes: {
        Args: { match_count?: number; query_embedding: string };
        Returns: {
          captured_at: string;
          note_id: string;
          note_type: Database['public']['Enums']['note_type'];
          original_text: string;
          personal_context: string;
          recall_prompt: string;
          similarity: number;
          source_title: string;
          source_url: string;
          summary: string;
          tags: string[];
        }[];
      };
      match_notes_for_user: {
        Args: {
          input_user_id: string;
          match_count?: number;
          query_embedding: string;
        };
        Returns: {
          captured_at: string;
          note_id: string;
          note_type: Database['public']['Enums']['note_type'];
          original_text: string;
          personal_context: string;
          recall_prompt: string;
          similarity: number;
          source_title: string;
          source_url: string;
          summary: string;
          tags: string[];
        }[];
      };
      normalize_whitespace: { Args: { input_text: string }; Returns: string };
      notification_cron_last_run: {
        Args: never;
        Returns: {
          ended_at: string;
          run_id: number;
          started_at: string;
          status: string;
        }[];
      };
      notification_cron_status: {
        Args: never;
        Returns: {
          active: boolean;
          job_id: number;
          schedule: string;
          secret_exposed: boolean;
        }[];
      };
      notification_digest_notes: {
        Args: { input_digest_date: string; input_user_id: string };
        Returns: {
          note_id: string;
          original_text: string;
          personal_context: string;
          recall_prompt: string;
          source_title: string;
          source_url: string;
          summary: string;
        }[];
      };
      practice_local_date: {
        Args: { input_now?: string; input_user_id: string };
        Returns: string;
      };
      record_review_feedback_for_user: {
        Args: {
          input_answered_at?: string;
          input_event_id: string;
          input_status: Database['public']['Enums']['review_status'];
          input_user_id: string;
        };
        Returns: boolean;
      };
      remove_notification_cron: { Args: never; Returns: boolean };
      reveal_review_for_user: {
        Args: { input_event_id: string; input_user_id: string };
        Returns: {
          original_text: string;
          source_title: string;
        }[];
      };
    };
    Enums: {
      capture_channel: 'extension' | 'web' | 'telegram_text' | 'telegram_voice';
      note_type:
        | 'quote'
        | 'argument'
        | 'lesson'
        | 'observation'
        | 'reflection'
        | 'principle'
        | 'conversation_note';
      practice_entry_kind: 'reflection' | 'story';
      practice_event_kind:
        | 'activation'
        | 'reread'
        | 'interval_change'
        | 'pause'
        | 'ready_to_resume'
        | 'resume'
        | 'integration'
        | 'integration_confirmation'
        | 'stopped_check_ins';
      practice_source_channel: 'web' | 'telegram_text' | 'telegram_voice';
      practice_status: 'active' | 'paused' | 'integrated';
      review_status:
        'pending' | 'sent' | 'remembered' | 'partial' | 'missed' | 'skipped';
      telegram_reply_intent: 'reflection' | 'story' | 'interval';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      capture_channel: ['extension', 'web', 'telegram_text', 'telegram_voice'],
      note_type: [
        'quote',
        'argument',
        'lesson',
        'observation',
        'reflection',
        'principle',
        'conversation_note',
      ],
      practice_entry_kind: ['reflection', 'story'],
      practice_event_kind: [
        'activation',
        'reread',
        'interval_change',
        'pause',
        'ready_to_resume',
        'resume',
        'integration',
        'integration_confirmation',
        'stopped_check_ins',
      ],
      practice_source_channel: ['web', 'telegram_text', 'telegram_voice'],
      practice_status: ['active', 'paused', 'integrated'],
      review_status: [
        'pending',
        'sent',
        'remembered',
        'partial',
        'missed',
        'skipped',
      ],
      telegram_reply_intent: ['reflection', 'story', 'interval'],
    },
  },
} as const;
