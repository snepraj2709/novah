-- Preserve legacy capture RPC signatures while allowing new first-party notes
-- to omit historical AI-generated metadata.

alter table public.notes
  alter column summary drop not null,
  alter column recall_prompt drop not null,
  drop constraint notes_summary_length,
  drop constraint notes_recall_prompt_length,
  add constraint notes_summary_length check (
    summary is null
    or (
      pg_catalog.char_length(summary) between 1 and 500
      and summary ~ '[^[:space:]]'
    )
  ),
  add constraint notes_recall_prompt_length check (
    recall_prompt is null
    or (
      pg_catalog.char_length(recall_prompt) between 1 and 500
      and recall_prompt ~ '[^[:space:]]'
    )
  );
