-- CryptoMainly Phase 2 membership actions.
-- The expiry date is the authority. These functions re-read and lock authoritative state
-- immediately before any consequential write and append immutable event/audit records.

create or replace function public.cm_add_membership_duration(
  p_base date,
  p_value integer,
  p_unit text
) returns date
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  target_first date;
  target_last date;
  target_day integer;
begin
  if p_base is null then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  if p_value is null or p_value <= 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  if p_unit = 'days' then
    return p_base + p_value;
  elsif p_unit = 'months' then
    target_first := (date_trunc('month', p_base::timestamp) + make_interval(months => p_value))::date;
    target_last := (target_first + interval '1 month - 1 day')::date;
    target_day := least(
      extract(day from p_base)::integer,
      extract(day from target_last)::integer
    );
    return make_date(
      extract(year from target_first)::integer,
      extract(month from target_first)::integer,
      target_day
    );
  end if;

  raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
end;
$$;

create or replace function public.admin_change_membership_expiry(
  p_member_id uuid,
  p_period_id uuid,
  p_expected_expiry date,
  p_new_expiry date,
  p_reason text,
  p_past_acknowledged boolean,
  p_actor_id text
) returns table(
  member_id uuid,
  membership_period_id uuid,
  old_expiry date,
  new_expiry date,
  payment_id uuid,
  event_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.membership_periods%rowtype;
  v_old_expiry date;
  v_reason text;
  v_actor text;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_event_id uuid;
begin
  if p_member_id is null or p_period_id is null or p_expected_expiry is null or p_new_expiry is null then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if v_reason = '' or char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  v_actor := coalesce(nullif(btrim(p_actor_id), ''), 'vip-admin');

  select mp.* into v_period
  from public.membership_periods mp
  where mp.id = p_period_id
    and mp.member_id = p_member_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTION_NOT_ALLOWED';
  end if;

  if v_period.expiry_mode <> 'fixed'
     or v_period.expires_on is null
     or v_period.ended_early_on is not null
     or v_period.expires_on < v_today
     or not exists (
       select 1
       from public.current_member_status cms
       where cms.member_id = p_member_id
         and cms.membership_period_id = p_period_id
         and cms.status = 'ACTIVE'
     ) then
    raise exception using errcode = 'P0001', message = 'ACTION_NOT_ALLOWED';
  end if;

  if v_period.expires_on is distinct from p_expected_expiry then
    raise exception using errcode = 'P0001', message = 'STALE_PREVIEW';
  end if;

  if p_new_expiry = v_period.expires_on then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  if p_new_expiry < v_today and p_past_acknowledged is not true then
    raise exception using errcode = 'P0001', message = 'PAST_EXPIRY_ACK_REQUIRED';
  end if;

  v_old_expiry := v_period.expires_on;

  update public.membership_periods
  set expires_on = p_new_expiry
  where id = p_period_id;

  insert into public.membership_events (
    member_id,
    membership_period_id,
    event_type,
    old_expiry,
    new_expiry,
    reason,
    actor_type,
    actor_id,
    metadata
  ) values (
    p_member_id,
    p_period_id,
    'EXPIRY_CHANGED',
    v_old_expiry,
    p_new_expiry,
    v_reason,
    'admin',
    v_actor,
    jsonb_build_object(
      'old_expiry', v_old_expiry,
      'new_expiry', p_new_expiry,
      'past_expiry_acknowledged', coalesce(p_past_acknowledged, false)
    )
  ) returning id into v_event_id;

  insert into public.audit_log (
    actor_type, actor_id, action, entity_type, entity_id,
    before_data, after_data, reason
  ) values (
    'admin', v_actor, 'EXPIRY_CHANGED', 'membership_period', p_period_id::text,
    to_jsonb(v_period),
    jsonb_set(to_jsonb(v_period), '{expires_on}', to_jsonb(p_new_expiry)),
    v_reason
  );

  return query select p_member_id, p_period_id, v_old_expiry, p_new_expiry, null::uuid, v_event_id;
end;
$$;

create or replace function public.admin_add_membership_time(
  p_member_id uuid,
  p_period_id uuid,
  p_expected_expiry date,
  p_duration_value integer,
  p_duration_unit text,
  p_reason text,
  p_actor_id text
) returns table(
  member_id uuid,
  membership_period_id uuid,
  old_expiry date,
  new_expiry date,
  payment_id uuid,
  event_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.membership_periods%rowtype;
  v_old_expiry date;
  v_new_expiry date;
  v_reason text;
  v_actor text;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_event_id uuid;
begin
  if p_member_id is null or p_period_id is null or p_expected_expiry is null
     or p_duration_value is null or p_duration_value <= 0
     or p_duration_unit not in ('days', 'months') then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if v_reason = '' or char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  v_actor := coalesce(nullif(btrim(p_actor_id), ''), 'vip-admin');

  select mp.* into v_period
  from public.membership_periods mp
  where mp.id = p_period_id
    and mp.member_id = p_member_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTION_NOT_ALLOWED';
  end if;

  if v_period.expiry_mode <> 'fixed'
     or v_period.expires_on is null
     or v_period.ended_early_on is not null
     or v_period.expires_on < v_today
     or not exists (
       select 1
       from public.current_member_status cms
       where cms.member_id = p_member_id
         and cms.membership_period_id = p_period_id
         and cms.status = 'ACTIVE'
     ) then
    raise exception using errcode = 'P0001', message = 'ACTION_NOT_ALLOWED';
  end if;

  if v_period.expires_on is distinct from p_expected_expiry then
    raise exception using errcode = 'P0001', message = 'STALE_PREVIEW';
  end if;

  v_old_expiry := v_period.expires_on;
  v_new_expiry := public.cm_add_membership_duration(v_old_expiry, p_duration_value, p_duration_unit);

  update public.membership_periods
  set expires_on = v_new_expiry
  where id = p_period_id;

  insert into public.membership_events (
    member_id,
    membership_period_id,
    event_type,
    old_expiry,
    new_expiry,
    adjustment_value,
    adjustment_unit,
    reason,
    actor_type,
    actor_id,
    metadata
  ) values (
    p_member_id,
    p_period_id,
    'MEMBERSHIP_TIME_ADDED',
    v_old_expiry,
    v_new_expiry,
    p_duration_value,
    p_duration_unit,
    v_reason,
    'admin',
    v_actor,
    jsonb_build_object(
      'old_expiry', v_old_expiry,
      'new_expiry', v_new_expiry,
      'duration_value', p_duration_value,
      'duration_unit', p_duration_unit
    )
  ) returning id into v_event_id;

  insert into public.audit_log (
    actor_type, actor_id, action, entity_type, entity_id,
    before_data, after_data, reason
  ) values (
    'admin', v_actor, 'MEMBERSHIP_TIME_ADDED', 'membership_period', p_period_id::text,
    to_jsonb(v_period),
    jsonb_set(to_jsonb(v_period), '{expires_on}', to_jsonb(v_new_expiry)),
    v_reason
  );

  return query select p_member_id, p_period_id, v_old_expiry, v_new_expiry, null::uuid, v_event_id;
end;
$$;

create or replace function public.admin_renew_active_membership(
  p_member_id uuid,
  p_period_id uuid,
  p_expected_expiry date,
  p_duration_value integer,
  p_duration_unit text,
  p_amount numeric,
  p_currency text,
  p_payment_date date,
  p_tx_hash text,
  p_payment_note text,
  p_reason text,
  p_actor_id text
) returns table(
  member_id uuid,
  membership_period_id uuid,
  old_expiry date,
  new_expiry date,
  payment_id uuid,
  event_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.membership_periods%rowtype;
  v_old_expiry date;
  v_new_expiry date;
  v_reason text;
  v_actor text;
  v_currency text;
  v_tx_hash text;
  v_payment_note text;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_payment_id uuid;
  v_event_id uuid;
begin
  if p_member_id is null or p_period_id is null or p_expected_expiry is null
     or p_duration_value is null or p_duration_value <= 0
     or p_duration_unit not in ('days', 'months')
     or p_amount is null or p_amount <= 0
     or p_payment_date is null then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if v_reason = '' or char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_currency := upper(btrim(coalesce(p_currency, '')));
  if v_currency = '' or char_length(v_currency) > 12 or v_currency !~ '^[A-Z0-9_-]+$' then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_tx_hash := nullif(btrim(coalesce(p_tx_hash, '')), '');
  if v_tx_hash is not null and char_length(v_tx_hash) > 200 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_payment_note := nullif(btrim(coalesce(p_payment_note, '')), '');
  if v_payment_note is not null and char_length(v_payment_note) > 2000 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_actor := coalesce(nullif(btrim(p_actor_id), ''), 'vip-admin');

  select mp.* into v_period
  from public.membership_periods mp
  where mp.id = p_period_id
    and mp.member_id = p_member_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTION_NOT_ALLOWED';
  end if;

  if v_period.entitlement_type <> 'paid'
     or v_period.expiry_mode <> 'fixed'
     or v_period.expires_on is null
     or v_period.ended_early_on is not null
     or v_period.expires_on < v_today
     or not exists (
       select 1
       from public.current_member_status cms
       where cms.member_id = p_member_id
         and cms.membership_period_id = p_period_id
         and cms.status = 'ACTIVE'
         and cms.entitlement_type = 'paid'
     ) then
    raise exception using errcode = 'P0001', message = 'ACTION_NOT_ALLOWED';
  end if;

  if v_period.expires_on is distinct from p_expected_expiry then
    raise exception using errcode = 'P0001', message = 'STALE_PREVIEW';
  end if;

  v_old_expiry := v_period.expires_on;
  v_new_expiry := public.cm_add_membership_duration(v_old_expiry, p_duration_value, p_duration_unit);

  insert into public.payments (
    member_id,
    membership_period_id,
    amount,
    currency,
    tx_hash,
    status,
    verification_method,
    received_at,
    verified_at,
    verified_by,
    notes
  ) values (
    p_member_id,
    p_period_id,
    p_amount,
    v_currency,
    v_tx_hash,
    'verified',
    'manual',
    ((p_payment_date::timestamp + time '12:00') at time zone 'Europe/London'),
    now(),
    v_actor,
    v_payment_note
  ) returning id into v_payment_id;

  update public.membership_periods
  set expires_on = v_new_expiry
  where id = p_period_id;

  insert into public.membership_events (
    member_id,
    membership_period_id,
    event_type,
    old_expiry,
    new_expiry,
    adjustment_value,
    adjustment_unit,
    reason,
    actor_type,
    actor_id,
    metadata
  ) values (
    p_member_id,
    p_period_id,
    'MEMBERSHIP_RENEWED',
    v_old_expiry,
    v_new_expiry,
    p_duration_value,
    p_duration_unit,
    v_reason,
    'admin',
    v_actor,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', p_amount,
      'currency', v_currency,
      'payment_date', p_payment_date,
      'tx_hash', v_tx_hash,
      'duration_value', p_duration_value,
      'duration_unit', p_duration_unit
    )
  ) returning id into v_event_id;

  insert into public.audit_log (
    actor_type, actor_id, action, entity_type, entity_id,
    before_data, after_data, reason
  ) values (
    'admin', v_actor, 'MEMBERSHIP_RENEWED', 'membership_period', p_period_id::text,
    to_jsonb(v_period),
    jsonb_build_object(
      'membership_period', jsonb_set(to_jsonb(v_period), '{expires_on}', to_jsonb(v_new_expiry)),
      'payment_id', v_payment_id
    ),
    v_reason
  );

  return query select p_member_id, p_period_id, v_old_expiry, v_new_expiry, v_payment_id, v_event_id;
end;
$$;

create or replace function public.admin_reactivate_membership(
  p_member_id uuid,
  p_expected_latest_period_id uuid,
  p_expected_latest_expiry date,
  p_reactivation_start date,
  p_duration_value integer,
  p_duration_unit text,
  p_amount numeric,
  p_currency text,
  p_payment_date date,
  p_tx_hash text,
  p_payment_note text,
  p_reason text,
  p_actor_id text
) returns table(
  member_id uuid,
  membership_period_id uuid,
  old_expiry date,
  new_expiry date,
  payment_id uuid,
  event_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members%rowtype;
  v_latest_id uuid;
  v_latest_expiry date;
  v_new_period_id uuid;
  v_new_expiry date;
  v_reason text;
  v_actor text;
  v_currency text;
  v_tx_hash text;
  v_payment_note text;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_payment_id uuid;
  v_event_id uuid;
begin
  if p_member_id is null or p_reactivation_start is null
     or p_duration_value is null or p_duration_value <= 0
     or p_duration_unit not in ('days', 'months')
     or p_amount is null or p_amount <= 0
     or p_payment_date is null
     or p_reactivation_start > v_today then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if v_reason = '' or char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_currency := upper(btrim(coalesce(p_currency, '')));
  if v_currency = '' or char_length(v_currency) > 12 or v_currency !~ '^[A-Z0-9_-]+$' then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_tx_hash := nullif(btrim(coalesce(p_tx_hash, '')), '');
  if v_tx_hash is not null and char_length(v_tx_hash) > 200 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_payment_note := nullif(btrim(coalesce(p_payment_note, '')), '');
  if v_payment_note is not null and char_length(v_payment_note) > 2000 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_actor := coalesce(nullif(btrim(p_actor_id), ''), 'vip-admin');

  select m.* into v_member
  from public.members m
  where m.id = p_member_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTION_NOT_ALLOWED';
  end if;

  if exists (
    select 1
    from public.membership_periods mp
    where mp.member_id = p_member_id
      and mp.ended_early_on is null
      and (mp.starts_on is null or mp.starts_on <= v_today)
      and (
        mp.expiry_mode in ('lifetime', 'manual_no_expiry')
        or (mp.expiry_mode = 'fixed' and mp.expires_on is not null and mp.expires_on >= v_today)
      )
  ) then
    raise exception using errcode = 'P0001', message = 'ACTION_NOT_ALLOWED';
  end if;

  select mp.id, mp.expires_on
  into v_latest_id, v_latest_expiry
  from public.membership_periods mp
  where mp.member_id = p_member_id
  order by
    case
      when mp.expiry_mode in ('lifetime', 'manual_no_expiry') and mp.ended_early_on is null then 0
      when mp.expires_on is not null then 1
      else 2
    end,
    mp.expires_on desc nulls last,
    mp.created_at desc
  limit 1;

  if v_latest_id is distinct from p_expected_latest_period_id
     or v_latest_expiry is distinct from p_expected_latest_expiry then
    raise exception using errcode = 'P0001', message = 'STALE_PREVIEW';
  end if;

  v_new_expiry := public.cm_add_membership_duration(p_reactivation_start, p_duration_value, p_duration_unit);

  if exists (
    select 1
    from public.membership_periods mp
    where mp.member_id = p_member_id
      and coalesce(mp.starts_on, '-infinity'::date) <= v_new_expiry
      and coalesce(mp.ended_early_on, mp.expires_on, 'infinity'::date) >= p_reactivation_start
  ) then
    raise exception using errcode = 'P0001', message = 'OVERLAPPING_ENTITLEMENT';
  end if;

  insert into public.membership_periods (
    member_id,
    entitlement_type,
    source,
    starts_on,
    expires_on,
    expiry_mode,
    removal_protected,
    migration_review
  ) values (
    p_member_id,
    'paid',
    'phase2_admin_reactivation',
    p_reactivation_start,
    v_new_expiry,
    'fixed',
    false,
    false
  ) returning id into v_new_period_id;

  insert into public.payments (
    member_id,
    membership_period_id,
    amount,
    currency,
    tx_hash,
    status,
    verification_method,
    received_at,
    verified_at,
    verified_by,
    notes
  ) values (
    p_member_id,
    v_new_period_id,
    p_amount,
    v_currency,
    v_tx_hash,
    'verified',
    'manual',
    ((p_payment_date::timestamp + time '12:00') at time zone 'Europe/London'),
    now(),
    v_actor,
    v_payment_note
  ) returning id into v_payment_id;

  insert into public.membership_events (
    member_id,
    membership_period_id,
    event_type,
    old_expiry,
    new_expiry,
    adjustment_value,
    adjustment_unit,
    reason,
    actor_type,
    actor_id,
    metadata
  ) values (
    p_member_id,
    v_new_period_id,
    'MEMBERSHIP_REACTIVATED',
    v_latest_expiry,
    v_new_expiry,
    p_duration_value,
    p_duration_unit,
    v_reason,
    'admin',
    v_actor,
    jsonb_build_object(
      'previous_membership_period_id', v_latest_id,
      'previous_expiry', v_latest_expiry,
      'reactivation_start', p_reactivation_start,
      'payment_id', v_payment_id,
      'amount', p_amount,
      'currency', v_currency,
      'payment_date', p_payment_date,
      'tx_hash', v_tx_hash,
      'duration_value', p_duration_value,
      'duration_unit', p_duration_unit
    )
  ) returning id into v_event_id;

  insert into public.audit_log (
    actor_type, actor_id, action, entity_type, entity_id,
    before_data, after_data, reason
  ) values (
    'admin', v_actor, 'MEMBERSHIP_REACTIVATED', 'member', p_member_id::text,
    jsonb_build_object(
      'latest_membership_period_id', v_latest_id,
      'latest_expiry', v_latest_expiry
    ),
    jsonb_build_object(
      'new_membership_period_id', v_new_period_id,
      'starts_on', p_reactivation_start,
      'expires_on', v_new_expiry,
      'payment_id', v_payment_id
    ),
    v_reason
  );

  return query select p_member_id, v_new_period_id, v_latest_expiry, v_new_expiry, v_payment_id, v_event_id;
end;
$$;

revoke all on function public.cm_add_membership_duration(date, integer, text) from public;
revoke all on function public.cm_add_membership_duration(date, integer, text) from anon;
revoke all on function public.cm_add_membership_duration(date, integer, text) from authenticated;
grant execute on function public.cm_add_membership_duration(date, integer, text) to service_role;

revoke all on function public.admin_change_membership_expiry(uuid, uuid, date, date, text, boolean, text) from public;
revoke all on function public.admin_change_membership_expiry(uuid, uuid, date, date, text, boolean, text) from anon;
revoke all on function public.admin_change_membership_expiry(uuid, uuid, date, date, text, boolean, text) from authenticated;
grant execute on function public.admin_change_membership_expiry(uuid, uuid, date, date, text, boolean, text) to service_role;

revoke all on function public.admin_add_membership_time(uuid, uuid, date, integer, text, text, text) from public;
revoke all on function public.admin_add_membership_time(uuid, uuid, date, integer, text, text, text) from anon;
revoke all on function public.admin_add_membership_time(uuid, uuid, date, integer, text, text, text) from authenticated;
grant execute on function public.admin_add_membership_time(uuid, uuid, date, integer, text, text, text) to service_role;

revoke all on function public.admin_renew_active_membership(uuid, uuid, date, integer, text, numeric, text, date, text, text, text, text) from public;
revoke all on function public.admin_renew_active_membership(uuid, uuid, date, integer, text, numeric, text, date, text, text, text, text) from anon;
revoke all on function public.admin_renew_active_membership(uuid, uuid, date, integer, text, numeric, text, date, text, text, text, text) from authenticated;
grant execute on function public.admin_renew_active_membership(uuid, uuid, date, integer, text, numeric, text, date, text, text, text, text) to service_role;

revoke all on function public.admin_reactivate_membership(uuid, uuid, date, date, integer, text, numeric, text, date, text, text, text, text) from public;
revoke all on function public.admin_reactivate_membership(uuid, uuid, date, date, integer, text, numeric, text, date, text, text, text, text) from anon;
revoke all on function public.admin_reactivate_membership(uuid, uuid, date, date, integer, text, numeric, text, date, text, text, text, text) from authenticated;
grant execute on function public.admin_reactivate_membership(uuid, uuid, date, date, integer, text, numeric, text, date, text, text, text, text) to service_role;
