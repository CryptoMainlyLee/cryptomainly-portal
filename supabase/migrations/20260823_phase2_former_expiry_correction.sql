-- Phase 2 safety correction: allow an audited Change Expiry on the selected
-- fixed-expiry period even when the member is currently FORMER.
-- This is specifically for administrative corrections after an expiry was set
-- incorrectly. Add Time remains blocked for former members and genuine returns
-- continue to use Renew / Reactivate.

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
     or not exists (
       select 1
       from public.current_member_status cms
       where cms.member_id = p_member_id
         and cms.membership_period_id = p_period_id
         and cms.status in ('ACTIVE', 'FORMER')
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

revoke all on function public.admin_change_membership_expiry(uuid, uuid, date, date, text, boolean, text) from public;
revoke all on function public.admin_change_membership_expiry(uuid, uuid, date, date, text, boolean, text) from anon;
revoke all on function public.admin_change_membership_expiry(uuid, uuid, date, date, text, boolean, text) from authenticated;
grant execute on function public.admin_change_membership_expiry(uuid, uuid, date, date, text, boolean, text) to service_role;
