-- Close helper functions that PostgREST would otherwise expose to anonymous
-- callers through the public schema. Authenticated writes still need these
-- functions for table constraints and triggers.
revoke all on function public.is_valid_timezone(text) from public, anon;
revoke all on function public.normalize_whitespace(text) from public, anon;
revoke all on function public.are_normalized_tags(text[]) from public, anon;
revoke all on function public.is_http_url(text) from public, anon;
revoke all on function public.set_updated_at() from public, anon;
revoke all on function public.normalize_note_original_text() from public, anon;

grant execute on function public.is_valid_timezone(text) to authenticated, service_role;
grant execute on function public.normalize_whitespace(text) to authenticated, service_role;
grant execute on function public.are_normalized_tags(text[]) to authenticated, service_role;
grant execute on function public.is_http_url(text) to authenticated, service_role;
grant execute on function public.set_updated_at() to authenticated, service_role;
grant execute on function public.normalize_note_original_text() to authenticated, service_role;

-- Backend functions use the service role for trusted, user-scoped workflows.
-- Keep its table grants explicit so access does not depend on environment
-- defaults; RLS remains enabled for client roles.
grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.notes to service_role;
grant select, insert, update, delete on table public.review_events to service_role;
grant select, insert, update, delete on table public.daily_digests to service_role;
grant select, insert, update, delete on table public.telegram_link_codes to service_role;

-- A secure linking code must resolve to one row and may never be valid for
-- longer than the locked ten-minute window.
alter table public.telegram_link_codes
  add constraint telegram_link_codes_hash_unique unique (code_hash),
  add constraint telegram_link_codes_ten_minute_expiry check (
    expires_at <= created_at + interval '10 minutes'
  );
