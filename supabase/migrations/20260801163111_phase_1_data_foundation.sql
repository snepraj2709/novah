create schema if not exists extensions;

create extension if not exists vector with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create type public.note_type as enum (
  'quote',
  'argument',
  'lesson',
  'observation',
  'reflection',
  'principle',
  'conversation_note'
);

create type public.capture_channel as enum (
  'extension',
  'web',
  'telegram_text',
  'telegram_voice'
);

create type public.review_status as enum (
  'pending',
  'sent',
  'remembered',
  'partial',
  'missed',
  'skipped'
);

create or replace function public.is_valid_timezone(timezone_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_timezone_names as timezone_entry
    where timezone_entry.name = timezone_name
  );
$$;

create or replace function public.normalize_whitespace(input_text text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.regexp_replace(pg_catalog.btrim(input_text), '\s+', ' ', 'g');
$$;

create or replace function public.are_normalized_tags(input_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    input_tags is not null
    and pg_catalog.cardinality(input_tags) between 0 and 5
    and not exists (
      select 1
      from pg_catalog.unnest(input_tags) as tag(value)
      where
        value is null
        or value = ''
        or value <> pg_catalog.lower(pg_catalog.btrim(value))
    )
    and pg_catalog.cardinality(input_tags) = (
      select pg_catalog.count(distinct value)
      from pg_catalog.unnest(input_tags) as tag(value)
    );
$$;

create or replace function public.is_http_url(input_url text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select input_url ~* '^https?://[^[:space:]]+$';
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Kolkata',
  digest_time time without time zone not null default '21:00',
  review_time time without time zone not null default '09:00',
  telegram_chat_id bigint unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_timezone_valid check (public.is_valid_timezone(timezone))
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  client_request_id uuid not null,
  original_text text not null,
  personal_context text,
  note_type public.note_type not null,
  summary text not null,
  tags text[] not null default '{}',
  recall_prompt text not null,
  source_title text,
  source_url text,
  capture_channel public.capture_channel not null,
  embedding extensions.vector(1536),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_user_client_request_unique unique (user_id, client_request_id),
  constraint notes_id_user_unique unique (id, user_id),
  constraint notes_original_text_present check (pg_catalog.char_length(original_text) > 0),
  constraint notes_personal_context_length check (
    personal_context is null or pg_catalog.char_length(personal_context) <= 2000
  ),
  constraint notes_summary_length check (pg_catalog.char_length(summary) <= 500),
  constraint notes_tags_normalized check (public.are_normalized_tags(tags)),
  constraint notes_source_url_http check (
    source_url is null or public.is_http_url(source_url)
  )
);

create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  note_id uuid not null,
  stage smallint not null,
  due_on date not null,
  sent_at timestamptz,
  status public.review_status not null default 'pending',
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint review_events_stage_range check (stage between 1 and 5),
  constraint review_events_note_stage_unique unique (note_id, stage),
  constraint review_events_owned_note_fk
    foreign key (note_id, user_id)
    references public.notes(id, user_id)
    on delete cascade
);

create table public.daily_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  digest_date date not null,
  note_ids uuid[] not null default '{}',
  content jsonb not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint daily_digests_user_date_unique unique (user_id, digest_date)
);

create table public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint telegram_link_codes_hash_present check (
    pg_catalog.char_length(pg_catalog.btrim(code_hash)) > 0
  ),
  constraint telegram_link_codes_expiry_after_creation check (expires_at > created_at)
);

create table public.processed_telegram_updates (
  update_id bigint primary key,
  processed_at timestamptz not null default now()
);

create index notes_user_captured_at_idx
  on public.notes (user_id, captured_at desc);
create index notes_user_note_type_idx
  on public.notes (user_id, note_type);
create index review_events_user_due_status_idx
  on public.review_events (user_id, due_on, status);
create index telegram_link_codes_user_expires_idx
  on public.telegram_link_codes (user_id, expires_at)
  where consumed_at is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.normalize_note_original_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.original_text = public.normalize_whitespace(new.original_text);
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger notes_normalize_original_text
before insert or update of original_text on public.notes
for each row execute function public.normalize_note_original_text();

create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.notes enable row level security;
alter table public.review_events enable row level security;
alter table public.daily_digests enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.processed_telegram_updates enable row level security;

create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy profiles_insert_own
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy profiles_delete_own
on public.profiles for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy notes_select_own
on public.notes for select
to authenticated
using ((select auth.uid()) = user_id);

create policy notes_insert_own
on public.notes for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy notes_update_own
on public.notes for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy notes_delete_own
on public.notes for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy review_events_select_own
on public.review_events for select
to authenticated
using ((select auth.uid()) = user_id);

create policy review_events_insert_own
on public.review_events for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy review_events_update_own
on public.review_events for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy review_events_delete_own
on public.review_events for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy daily_digests_select_own
on public.daily_digests for select
to authenticated
using ((select auth.uid()) = user_id);

create policy daily_digests_insert_own
on public.daily_digests for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy daily_digests_update_own
on public.daily_digests for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy daily_digests_delete_own
on public.daily_digests for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy telegram_link_codes_select_own
on public.telegram_link_codes for select
to authenticated
using ((select auth.uid()) = user_id);

create policy telegram_link_codes_insert_own
on public.telegram_link_codes for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy telegram_link_codes_update_own
on public.telegram_link_codes for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy telegram_link_codes_delete_own
on public.telegram_link_codes for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.match_notes(
  query_embedding extensions.vector(1536),
  match_count integer default 8
)
returns table (
  note_id uuid,
  original_text text,
  personal_context text,
  note_type public.note_type,
  summary text,
  tags text[],
  recall_prompt text,
  source_title text,
  source_url text,
  captured_at timestamptz,
  similarity double precision
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  return query
  select
    note.id,
    note.original_text,
    note.personal_context,
    note.note_type,
    note.summary,
    note.tags,
    note.recall_prompt,
    note.source_title,
    note.source_url,
    note.captured_at,
    1 - (note.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.notes as note
  where
    note.user_id = (select auth.uid())
    and note.embedding is not null
  order by note.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(coalesce(match_count, 8), 1), 20);
end;
$$;

revoke all on table public.profiles from anon;
revoke all on table public.notes from anon;
revoke all on table public.review_events from anon;
revoke all on table public.daily_digests from anon;
revoke all on table public.telegram_link_codes from anon;
revoke all on table public.processed_telegram_updates from anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.notes to authenticated;
grant select, insert, update, delete on table public.review_events to authenticated;
grant select, insert, update, delete on table public.daily_digests to authenticated;
grant select, insert, update, delete on table public.telegram_link_codes to authenticated;
grant all on table public.processed_telegram_updates to service_role;

grant usage on schema extensions to authenticated, service_role;
grant usage on type public.note_type to authenticated, service_role;
grant usage on type public.capture_channel to authenticated, service_role;
grant usage on type public.review_status to authenticated, service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.match_notes(extensions.vector, integer) from public, anon;
grant execute on function public.match_notes(extensions.vector, integer) to authenticated;
grant execute on function public.match_notes(extensions.vector, integer) to service_role;
