-- Idea 3: bandwidth-aware Practice lifecycle and grouped check-in delivery.

alter table public.note_practices
  drop constraint note_practices_state_valid;

alter table public.note_practices
  add constraint note_practices_state_valid check (
    (
      status = 'active'
      and next_due_on is not null
      and paused_until is null
      and ready_to_resume = false
      and integrated_at is null
      and check_ins_enabled = false
      and next_check_in_on is null
      and check_in_notification_claimed_at is null
      and check_in_notification_sent_on is null
    )
    or (
      status = 'paused'
      and next_due_on is null
      and integrated_at is null
      and check_ins_enabled = false
      and next_check_in_on is null
      and check_in_notification_claimed_at is null
      and check_in_notification_sent_on is null
      and (ready_to_resume = false or paused_until is not null)
    )
    or (
      status = 'integrated'
      and next_due_on is null
      and paused_until is null
      and ready_to_resume = false
      and integrated_at is not null
      and active_notification_claimed_at is null
      and active_notification_sent_on is null
      and (
        (check_ins_enabled = true and next_check_in_on is not null)
        or (
          check_ins_enabled = false
          and next_check_in_on is null
          and check_in_notification_claimed_at is null
          and check_in_notification_sent_on is null
        )
      )
    )
  );

create index note_practices_paused_due_idx
  on public.note_practices (user_id, paused_until, note_id)
  where status = 'paused' and paused_until is not null;

create index note_practices_check_in_due_idx
  on public.note_practices (user_id, next_check_in_on, note_id)
  where status = 'integrated' and check_ins_enabled;

-- Application roles mutate lifecycle state and append events only through the
-- owner-scoped security-definer functions below.
revoke insert, update, delete, truncate on table public.note_practices
from service_role;
revoke insert, update, delete, truncate on table public.practice_events
from service_role;

drop function public.manage_practice_core(uuid, text, uuid, timestamptz);

create function public.manage_practice_core(
  input_user_id uuid,
  input_action text,
  input_note_id uuid,
  input_now timestamptz default statement_timestamp(),
  input_interval_days smallint default null,
  input_resume_on date default null
)
returns table (
  note_id uuid,
  status public.practice_status,
  interval_days smallint,
  next_due_on date,
  paused_until date,
  ready_to_resume boolean,
  integrated_at timestamptz,
  check_ins_enabled boolean,
  next_check_in_on date,
  last_practised_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  local_today date;
  current_practice public.note_practices%rowtype;
  inserted_count integer := 0;
  previous_status public.practice_status;
begin
  if input_action not in (
    'activate', 'reread', 'setInterval', 'pause', 'resume', 'integrate',
    'confirmIntegrated', 'stopCheckIns'
  ) then
    raise check_violation using message = 'invalid_transition';
  end if;

  select (input_now at time zone profile.timezone)::date
  into local_today
  from public.profiles as profile
  where profile.user_id = input_user_id
  for update;

  if local_today is null then
    raise foreign_key_violation using message = 'practice_not_found';
  end if;

  if not exists (
    select 1 from public.notes as note
    where note.id = input_note_id and note.user_id = input_user_id
  ) then
    raise no_data_found using message = 'practice_not_found';
  end if;

  select practice.* into current_practice
  from public.note_practices as practice
  where practice.note_id = input_note_id and practice.user_id = input_user_id
  for update;

  if input_action = 'activate' then
    if input_interval_days is not null or input_resume_on is not null then
      raise check_violation using message = 'invalid_transition';
    end if;
    if current_practice.note_id is null then
      if (
        select count(*)
        from public.note_practices as active_practice
        where active_practice.user_id = input_user_id
          and active_practice.status = 'active'
      ) >= 3 then
        raise program_limit_exceeded using message = 'practice_slots_full';
      end if;

      insert into public.note_practices (
        note_id,
        user_id,
        status,
        interval_days,
        next_due_on
      )
      select
        input_note_id,
        input_user_id,
        'active',
        profile.last_practice_interval_days,
        local_today + 1
      from public.profiles as profile
      where profile.user_id = input_user_id
      returning * into current_practice;

      insert into public.practice_events (
        user_id, note_id, event_kind, occurred_at, local_date
      ) values (
        input_user_id, input_note_id, 'activation', input_now, local_today
      ) on conflict do nothing;
    elsif current_practice.status <> 'active' then
      raise check_violation using message = 'invalid_transition';
    end if;

  elsif input_action = 'reread' then
    if input_interval_days is not null or input_resume_on is not null then
      raise check_violation using message = 'invalid_transition';
    end if;
    if current_practice.note_id is null then
      raise no_data_found using message = 'practice_not_found';
    end if;
    if current_practice.status <> 'active' then
      raise check_violation using message = 'invalid_transition';
    end if;

    if current_practice.next_due_on <= local_today then
      insert into public.practice_events (
        user_id, note_id, event_kind, occurred_at, local_date
      ) values (
        input_user_id, input_note_id, 'reread', input_now, local_today
      ) on conflict do nothing;
      get diagnostics inserted_count = row_count;

      if inserted_count = 1 then
        update public.note_practices as practice
        set
          next_due_on = local_today + practice.interval_days,
          last_practised_at = input_now,
          active_notification_claimed_at = null
        where practice.note_id = input_note_id
          and practice.user_id = input_user_id
        returning * into current_practice;
      end if;
    end if;

  elsif input_action = 'setInterval' then
    if input_resume_on is not null
      or input_interval_days is null
      or input_interval_days not between 1 and 30 then
      raise check_violation using message = 'invalid_transition';
    end if;
    if current_practice.note_id is null then
      raise no_data_found using message = 'practice_not_found';
    end if;
    if current_practice.status <> 'active' then
      raise check_violation using message = 'invalid_transition';
    end if;

    update public.profiles as profile
    set last_practice_interval_days = input_interval_days
    where profile.user_id = input_user_id;

    if current_practice.interval_days <> input_interval_days then
      insert into public.practice_events (
        user_id, note_id, event_kind, occurred_at, local_date, metadata
      ) values (
        input_user_id,
        input_note_id,
        'interval_change',
        input_now,
        local_today,
        jsonb_build_object(
          'previousIntervalDays', current_practice.interval_days,
          'newIntervalDays', input_interval_days
        )
      );

      update public.note_practices as practice
      set
        interval_days = input_interval_days,
        next_due_on = local_today + input_interval_days,
        active_notification_claimed_at = null,
        active_notification_sent_on = null
      where practice.note_id = input_note_id
        and practice.user_id = input_user_id
      returning * into current_practice;
    end if;

  elsif input_action = 'pause' then
    if input_interval_days is not null
      or (input_resume_on is not null and input_resume_on <= local_today) then
      raise check_violation using message = 'invalid_transition';
    end if;
    if current_practice.note_id is null then
      raise no_data_found using message = 'practice_not_found';
    end if;
    if current_practice.status = 'paused'
      and current_practice.paused_until is not distinct from input_resume_on then
      return query select
        current_practice.note_id,
        current_practice.status,
        current_practice.interval_days,
        current_practice.next_due_on,
        current_practice.paused_until,
        current_practice.ready_to_resume,
        current_practice.integrated_at,
        current_practice.check_ins_enabled,
        current_practice.next_check_in_on,
        current_practice.last_practised_at;
      return;
    end if;
    if current_practice.status <> 'active' then
      raise check_violation using message = 'invalid_transition';
    end if;

    update public.note_practices as practice
    set
      status = 'paused',
      next_due_on = null,
      paused_until = input_resume_on,
      ready_to_resume = false,
      active_notification_claimed_at = null,
      active_notification_sent_on = null
    where practice.note_id = input_note_id
      and practice.user_id = input_user_id
    returning * into current_practice;

    insert into public.practice_events (
      user_id, note_id, event_kind, occurred_at, local_date, metadata
    ) values (
      input_user_id,
      input_note_id,
      'pause',
      input_now,
      local_today,
      case
        when input_resume_on is null then '{}'::jsonb
        else jsonb_build_object('resumeOn', input_resume_on)
      end
    );

  elsif input_action = 'resume' then
    if input_interval_days is not null or input_resume_on is not null then
      raise check_violation using message = 'invalid_transition';
    end if;
    if current_practice.note_id is null then
      raise no_data_found using message = 'practice_not_found';
    end if;
    if current_practice.status = 'active' then
      raise raise_exception using message = 'stale_action';
    end if;
    if current_practice.status not in ('paused', 'integrated') then
      raise check_violation using message = 'invalid_transition';
    end if;
    if (
      select count(*)
      from public.note_practices as active_practice
      where active_practice.user_id = input_user_id
        and active_practice.status = 'active'
    ) >= 3 then
      raise program_limit_exceeded using message = 'practice_slots_full';
    end if;

    previous_status := current_practice.status;
    update public.note_practices as practice
    set
      status = 'active',
      next_due_on = local_today + 1,
      paused_until = null,
      ready_to_resume = false,
      integrated_at = null,
      check_ins_enabled = false,
      next_check_in_on = null,
      active_notification_claimed_at = null,
      active_notification_sent_on = null,
      check_in_notification_claimed_at = null,
      check_in_notification_sent_on = null
    where practice.note_id = input_note_id
      and practice.user_id = input_user_id
    returning * into current_practice;

    insert into public.practice_events (
      user_id, note_id, event_kind, occurred_at, local_date, metadata
    ) values (
      input_user_id,
      input_note_id,
      'resume',
      input_now,
      local_today,
      jsonb_build_object('fromStatus', previous_status::text, 'automatic', false)
    );

  elsif input_action = 'integrate' then
    if input_interval_days is not null or input_resume_on is not null then
      raise check_violation using message = 'invalid_transition';
    end if;
    if current_practice.note_id is null then
      raise no_data_found using message = 'practice_not_found';
    end if;
    if current_practice.status = 'integrated' then
      raise raise_exception using message = 'stale_action';
    end if;
    if current_practice.status not in ('active', 'paused') then
      raise check_violation using message = 'invalid_transition';
    end if;

    update public.note_practices as practice
    set
      status = 'integrated',
      next_due_on = null,
      paused_until = null,
      ready_to_resume = false,
      integrated_at = input_now,
      check_ins_enabled = true,
      next_check_in_on = local_today + 30,
      active_notification_claimed_at = null,
      active_notification_sent_on = null,
      check_in_notification_claimed_at = null,
      check_in_notification_sent_on = null
    where practice.note_id = input_note_id
      and practice.user_id = input_user_id
    returning * into current_practice;

    insert into public.practice_events (
      user_id, note_id, event_kind, occurred_at, local_date
    ) values (
      input_user_id, input_note_id, 'integration', input_now, local_today
    );

  elsif input_action = 'confirmIntegrated' then
    if input_interval_days is not null or input_resume_on is not null then
      raise check_violation using message = 'invalid_transition';
    end if;
    if current_practice.note_id is null then
      raise no_data_found using message = 'practice_not_found';
    end if;
    if current_practice.status <> 'integrated'
      or current_practice.check_ins_enabled = false then
      raise check_violation using message = 'invalid_transition';
    end if;
    if current_practice.next_check_in_on > local_today then
      raise raise_exception using message = 'stale_action';
    end if;

    update public.note_practices as practice
    set
      next_check_in_on = local_today + 30,
      check_in_notification_claimed_at = null,
      check_in_notification_sent_on = null
    where practice.note_id = input_note_id
      and practice.user_id = input_user_id
    returning * into current_practice;

    insert into public.practice_events (
      user_id, note_id, event_kind, occurred_at, local_date
    ) values (
      input_user_id,
      input_note_id,
      'integration_confirmation',
      input_now,
      local_today
    );

  else
    if input_interval_days is not null or input_resume_on is not null then
      raise check_violation using message = 'invalid_transition';
    end if;
    if current_practice.note_id is null then
      raise no_data_found using message = 'practice_not_found';
    end if;
    if current_practice.status <> 'integrated' then
      raise check_violation using message = 'invalid_transition';
    end if;
    if current_practice.check_ins_enabled = false then
      raise raise_exception using message = 'stale_action';
    end if;

    update public.note_practices as practice
    set
      check_ins_enabled = false,
      next_check_in_on = null,
      check_in_notification_claimed_at = null,
      check_in_notification_sent_on = null
    where practice.note_id = input_note_id
      and practice.user_id = input_user_id
    returning * into current_practice;

    insert into public.practice_events (
      user_id, note_id, event_kind, occurred_at, local_date
    ) values (
      input_user_id, input_note_id, 'stopped_check_ins', input_now, local_today
    );
  end if;

  return query select
    current_practice.note_id,
    current_practice.status,
    current_practice.interval_days,
    current_practice.next_due_on,
    current_practice.paused_until,
    current_practice.ready_to_resume,
    current_practice.integrated_at,
    current_practice.check_ins_enabled,
    current_practice.next_check_in_on,
    current_practice.last_practised_at;
end;
$$;

revoke all on function public.manage_practice_core(
  uuid, text, uuid, timestamptz, smallint, date
) from public, anon, authenticated;
grant execute on function public.manage_practice_core(
  uuid, text, uuid, timestamptz, smallint, date
) to service_role;

drop function public.manage_practice(text, uuid);

create function public.manage_practice(
  input_action text,
  input_note_id uuid,
  input_interval_days smallint default null,
  input_resume_on date default null
)
returns table (
  note_id uuid,
  status public.practice_status,
  interval_days smallint,
  next_due_on date,
  paused_until date,
  ready_to_resume boolean,
  integrated_at timestamptz,
  check_ins_enabled boolean,
  next_check_in_on date,
  last_practised_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  return query select * from public.manage_practice_core(
    caller_id,
    input_action,
    input_note_id,
    statement_timestamp(),
    input_interval_days,
    input_resume_on
  );
end;
$$;

revoke all on function public.manage_practice(text, uuid, smallint, date)
from public, anon;
grant execute on function public.manage_practice(text, uuid, smallint, date)
to authenticated;

drop function public.manage_practice_for_user(uuid, text, uuid);

create function public.manage_practice_for_user(
  input_user_id uuid,
  input_action text,
  input_note_id uuid,
  input_interval_days smallint default null,
  input_resume_on date default null
)
returns table (
  note_id uuid,
  status public.practice_status,
  interval_days smallint,
  next_due_on date,
  paused_until date,
  ready_to_resume boolean,
  integrated_at timestamptz,
  check_ins_enabled boolean,
  next_check_in_on date,
  last_practised_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;
  return query select * from public.manage_practice_core(
    input_user_id,
    input_action,
    input_note_id,
    statement_timestamp(),
    input_interval_days,
    input_resume_on
  );
end;
$$;

revoke all on function public.manage_practice_for_user(
  uuid, text, uuid, smallint, date
) from public, anon, authenticated;
grant execute on function public.manage_practice_for_user(
  uuid, text, uuid, smallint, date
) to service_role;

create function public.reconcile_due_pauses(
  input_user_id uuid,
  input_local_date date,
  input_now timestamptz
)
returns table (resumed_count integer, ready_count integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  active_count integer;
  candidate public.note_practices%rowtype;
  resumed integer := 0;
  ready integer := 0;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  perform 1 from public.profiles as profile
  where profile.user_id = input_user_id
  for update;
  if not found then
    raise no_data_found using message = 'practice_not_found';
  end if;

  select count(*) into active_count
  from public.note_practices as practice
  where practice.user_id = input_user_id and practice.status = 'active';

  for candidate in
    select practice.*
    from public.note_practices as practice
    where practice.user_id = input_user_id
      and practice.status = 'paused'
      and practice.paused_until <= input_local_date
    order by practice.paused_until, practice.note_id
    for update
  loop
    if active_count < 3 then
      update public.note_practices as practice
      set
        status = 'active',
        next_due_on = input_local_date + 1,
        paused_until = null,
        ready_to_resume = false,
        active_notification_claimed_at = null,
        active_notification_sent_on = null
      where practice.note_id = candidate.note_id;

      insert into public.practice_events (
        user_id, note_id, event_kind, occurred_at, local_date, metadata
      ) values (
        input_user_id,
        candidate.note_id,
        'resume',
        input_now,
        input_local_date,
        jsonb_build_object('fromStatus', 'paused', 'automatic', true)
      );
      active_count := active_count + 1;
      resumed := resumed + 1;
    elsif candidate.ready_to_resume = false then
      update public.note_practices as practice
      set
        ready_to_resume = true,
        active_notification_claimed_at = null,
        active_notification_sent_on = null
      where practice.note_id = candidate.note_id;

      insert into public.practice_events (
        user_id, note_id, event_kind, occurred_at, local_date
      ) values (
        input_user_id,
        candidate.note_id,
        'ready_to_resume',
        input_now,
        input_local_date
      );
      ready := ready + 1;
    end if;
  end loop;

  return query select resumed, ready;
end;
$$;

revoke all on function public.reconcile_due_pauses(uuid, date, timestamptz)
from public, anon, authenticated;
grant execute on function public.reconcile_due_pauses(uuid, date, timestamptz)
to service_role;

create function public.claim_ready_practices(
  input_user_id uuid,
  input_claimed_at timestamptz
)
returns table (
  note_id uuid,
  original_text text,
  source_title text
)
language sql
volatile
security definer
set search_path = ''
as $$
  with claimed as (
    select practice.note_id
    from public.note_practices as practice
    where practice.user_id = input_user_id
      and practice.status = 'paused'
      and practice.ready_to_resume
      and practice.active_notification_sent_on is null
      and (
        practice.active_notification_claimed_at is null
        or practice.active_notification_claimed_at < input_claimed_at - interval '15 minutes'
      )
    order by practice.paused_until, practice.note_id
    for update skip locked
  ), updated as (
    update public.note_practices as practice
    set active_notification_claimed_at = input_claimed_at
    from claimed
    where practice.note_id = claimed.note_id
    returning practice.note_id
  )
  select updated.note_id, note.original_text, note.source_title
  from updated
  join public.notes as note on note.id = updated.note_id
  order by updated.note_id;
$$;

revoke all on function public.claim_ready_practices(uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.claim_ready_practices(uuid, timestamptz)
to service_role;

create function public.mark_ready_practice_sent(
  input_user_id uuid,
  input_note_id uuid,
  input_local_date date,
  input_claimed_at timestamptz
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_practice public.note_practices%rowtype;
begin
  select practice.* into current_practice
  from public.note_practices as practice
  where practice.user_id = input_user_id
    and practice.note_id = input_note_id
  for update;

  if current_practice.note_id is null then
    return false;
  end if;

  if current_practice.active_notification_claimed_at is null then
    return current_practice.active_notification_sent_on is not null
      or current_practice.status <> 'paused'
      or current_practice.ready_to_resume = false;
  end if;

  if current_practice.active_notification_claimed_at <> input_claimed_at then
    return false;
  end if;

  update public.note_practices as practice
  set
    active_notification_sent_on = input_local_date,
    active_notification_claimed_at = null
  where practice.user_id = input_user_id
    and practice.note_id = input_note_id
    and practice.status = 'paused'
    and practice.ready_to_resume
    and practice.active_notification_claimed_at = input_claimed_at;
  return found;
end;
$$;

revoke all on function public.mark_ready_practice_sent(uuid, uuid, date, timestamptz)
from public, anon, authenticated;
grant execute on function public.mark_ready_practice_sent(uuid, uuid, date, timestamptz)
to service_role;

create function public.claim_due_check_ins(
  input_user_id uuid,
  input_local_date date,
  input_claimed_at timestamptz
)
returns table (
  note_id uuid,
  original_text text,
  source_title text,
  next_check_in_on date
)
language sql
volatile
security definer
set search_path = ''
as $$
  with claimed as (
    select practice.note_id
    from public.note_practices as practice
    where practice.user_id = input_user_id
      and practice.status = 'integrated'
      and practice.check_ins_enabled
      and practice.next_check_in_on <= input_local_date
      and practice.check_in_notification_sent_on is null
      and (
        practice.check_in_notification_claimed_at is null
        or practice.check_in_notification_claimed_at < input_claimed_at - interval '15 minutes'
      )
    order by practice.next_check_in_on, practice.note_id
    for update skip locked
  ), updated as (
    update public.note_practices as practice
    set check_in_notification_claimed_at = input_claimed_at
    from claimed
    where practice.note_id = claimed.note_id
    returning practice.note_id, practice.next_check_in_on
  )
  select
    updated.note_id,
    note.original_text,
    note.source_title,
    updated.next_check_in_on
  from updated
  join public.notes as note on note.id = updated.note_id
  order by updated.next_check_in_on, updated.note_id;
$$;

revoke all on function public.claim_due_check_ins(uuid, date, timestamptz)
from public, anon, authenticated;
grant execute on function public.claim_due_check_ins(uuid, date, timestamptz)
to service_role;

create function public.mark_check_ins_sent(
  input_user_id uuid,
  input_note_ids uuid[],
  input_local_date date,
  input_claimed_at timestamptz
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  owned_count integer;
begin
  if input_note_ids is null
    or cardinality(input_note_ids) = 0
    or cardinality(input_note_ids) <> (
      select count(distinct item.note_id)
      from unnest(input_note_ids) as item(note_id)
    ) then
    return false;
  end if;

  perform 1
  from public.note_practices as practice
  where practice.user_id = input_user_id
    and practice.note_id = any(input_note_ids)
  order by practice.note_id
  for update;

  select count(*) into owned_count
  from public.note_practices as practice
  where practice.user_id = input_user_id
    and practice.note_id = any(input_note_ids);

  if owned_count <> cardinality(input_note_ids)
    or exists (
      select 1
      from public.note_practices as practice
      where practice.user_id = input_user_id
        and practice.note_id = any(input_note_ids)
        and practice.check_in_notification_claimed_at is not null
        and practice.check_in_notification_claimed_at <> input_claimed_at
    )
    or exists (
      select 1
      from public.note_practices as practice
      where practice.user_id = input_user_id
        and practice.note_id = any(input_note_ids)
        and practice.check_in_notification_claimed_at is null
        and practice.check_in_notification_sent_on is null
        and practice.status = 'integrated'
        and practice.check_ins_enabled
        and practice.next_check_in_on <= input_local_date
    ) then
    return false;
  end if;

  update public.note_practices as practice
  set
    check_in_notification_sent_on = input_local_date,
    check_in_notification_claimed_at = null
  where practice.user_id = input_user_id
    and practice.note_id = any(input_note_ids)
    and practice.status = 'integrated'
    and practice.check_ins_enabled
    and practice.check_in_notification_claimed_at = input_claimed_at;
  return true;
end;
$$;

revoke all on function public.mark_check_ins_sent(uuid, uuid[], date, timestamptz)
from public, anon, authenticated;
grant execute on function public.mark_check_ins_sent(uuid, uuid[], date, timestamptz)
to service_role;

create or replace function public.create_telegram_reply_prompt(
  input_user_id uuid,
  input_chat_id bigint,
  input_prompt_message_id bigint,
  input_note_id uuid,
  input_intent public.telegram_reply_intent,
  input_now timestamptz default statement_timestamp()
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  prompt_expires_at timestamptz := input_now + interval '24 hours';
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.user_id = input_user_id
      and profile.telegram_chat_id = input_chat_id
  ) or not exists (
    select 1 from public.note_practices as practice
    where practice.user_id = input_user_id
      and practice.note_id = input_note_id
  ) then
    raise no_data_found using message = 'practice_not_found';
  end if;

  insert into public.telegram_reply_prompts (
    chat_id,
    prompt_message_id,
    user_id,
    note_id,
    intent,
    expires_at,
    created_at
  ) values (
    input_chat_id,
    input_prompt_message_id,
    input_user_id,
    input_note_id,
    input_intent,
    prompt_expires_at,
    input_now
  );
  return prompt_expires_at;
end;
$$;

create function public.consume_telegram_interval_reply(
  input_user_id uuid,
  input_chat_id bigint,
  input_prompt_message_id bigint,
  input_interval_days smallint,
  input_now timestamptz default statement_timestamp()
)
returns table (
  note_id uuid,
  status public.practice_status,
  interval_days smallint,
  next_due_on date,
  paused_until date,
  ready_to_resume boolean,
  integrated_at timestamptz,
  check_ins_enabled boolean,
  next_check_in_on date,
  last_practised_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_prompt public.telegram_reply_prompts%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;
  if input_interval_days is null or input_interval_days not between 1 and 30 then
    raise check_violation using message = 'invalid_transition';
  end if;

  select prompt.* into current_prompt
  from public.telegram_reply_prompts as prompt
  where prompt.user_id = input_user_id
    and prompt.chat_id = input_chat_id
    and prompt.prompt_message_id = input_prompt_message_id
  for update;

  if current_prompt.id is null
    or current_prompt.consumed_at is not null
    or current_prompt.expires_at <= input_now then
    raise raise_exception using message = 'reply_expired';
  end if;
  if current_prompt.intent <> 'interval' then
    raise check_violation using message = 'invalid_transition';
  end if;

  update public.telegram_reply_prompts as prompt
  set consumed_at = input_now
  where prompt.id = current_prompt.id;

  return query select * from public.manage_practice_core(
    input_user_id,
    'setInterval',
    current_prompt.note_id,
    input_now,
    input_interval_days,
    null
  );
end;
$$;

revoke all on function public.consume_telegram_interval_reply(
  uuid, bigint, bigint, smallint, timestamptz
) from public, anon, authenticated;
grant execute on function public.consume_telegram_interval_reply(
  uuid, bigint, bigint, smallint, timestamptz
) to service_role;
