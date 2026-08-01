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
          recall_prompt: string;
          source_title: string | null;
          source_url: string | null;
          summary: string;
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
          recall_prompt: string;
          source_title?: string | null;
          source_url?: string | null;
          summary: string;
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
          recall_prompt?: string;
          source_title?: string | null;
          source_url?: string | null;
          summary?: string;
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
          review_time: string;
          telegram_chat_id: number | null;
          timezone: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          digest_time?: string;
          review_time?: string;
          telegram_chat_id?: number | null;
          timezone?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          digest_time?: string;
          review_time?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
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
          first_review_date: string;
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
          first_review_date: string;
          note_id: string;
          stored_note_type: Database['public']['Enums']['note_type'];
          stored_original_text: string;
          stored_summary: string;
          stored_tags: string[];
        }[];
      };
      consume_telegram_link_code: {
        Args: { input_chat_id: number; input_code_hash: string };
        Returns: string;
      };
      create_telegram_link_code: {
        Args: { input_code_hash: string };
        Returns: {
          connected: boolean;
          expires_at: string;
        }[];
      };
      is_http_url: { Args: { input_url: string }; Returns: boolean };
      is_valid_timezone: { Args: { timezone_name: string }; Returns: boolean };
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
      review_status:
        'pending' | 'sent' | 'remembered' | 'partial' | 'missed' | 'skipped';
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
      review_status: [
        'pending',
        'sent',
        'remembered',
        'partial',
        'missed',
        'skipped',
      ],
    },
  },
} as const;
