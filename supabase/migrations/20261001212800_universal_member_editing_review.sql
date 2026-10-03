-- CryptoMainly Universal Member Editing & Review Resolution.
-- Review cases are reusable workflow records; legacy migration flags are transitional provenance.
-- Operational corrections added later in this migration remain scoped and audited.

create table public.member_review_cases (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  membership_period_id uuid references public.membership_periods(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  origin text not null,
  category text not null,
  opening_reason text not null,
  status text not null default 'OPEN',
  opened_at timestamptz not null default now(),
  opened_by text not null,
  resolution_outcome text,
  resolution_note text,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now(),
  constraint member_review_cases_link_check
    check (num_nonnulls(membership_period_id, payment_id) <= 1),
  constraint member_review_cases_origin_check
    check (origin in ('legacy_migration','manual','add_member')),
  constraint member_review_cases_category_check
    check (category in ('identity_contact','membership','payment','telegram','historical','other')),
  constraint member_review_cases_status_check
    check (status in ('OPEN','RESOLVED')),
  constraint member_review_cases_outcome_check
    check (resolution_outcome is null or resolution_outcome in (
      'CORRECTED_DATA_UPDATED','EXISTING_DATA_CONFIRMED','HISTORICAL_DETAIL_UNKNOWN_ACCEPTED'
    )),
  constraint member_review_cases_opening_reason_check
    check (btrim(opening_reason) <> '' and char_length(btrim(opening_reason)) <= 500),
  constraint member_review_cases_opened_by_check
    check (btrim(opened_by) <> '' and char_length(btrim(opened_by)) <= 200),
  constraint member_review_cases_resolution_note_check
    check (resolution_note is null or (btrim(resolution_note) <> '' and char_length(btrim(resolution_note)) <= 500)),
  constraint member_review_cases_resolved_by_check
    check (resolved_by is null or (btrim(resolved_by) <> '' and char_length(btrim(resolved_by)) <= 200)),
  constraint member_review_cases_resolution_state_check check (
    (status='OPEN' and resolution_outcome is null and resolution_note is null
      and resolved_at is null and resolved_by is null)
    or
    (status='RESOLVED' and resolution_outcome is not null and resolution_note is not null
      and resolved_at is not null and resolved_by is not null)
  ),
  constraint member_review_cases_resolution_time_check
    check (resolved_at is null or resolved_at >= opened_at)
);

create unique index member_review_cases_one_open_issue_uidx
  on public.member_review_cases(member_id, membership_period_id, payment_id, category)
  nulls not distinct
  where status='OPEN';

alter table public.member_review_cases enable row level security;

create view public.admin_member_review_summary
with (security_invoker = true)
as
select
  agg.member_id,
  agg.open_review_count,
  agg.review_categories,
  first_case.opening_reason as review_reason,
  first_case.opened_at as review_opened_at
from (
  select
    rc.member_id,
    count(*)::integer as open_review_count,
    array_agg(distinct rc.category order by rc.category) as review_categories
  from public.member_review_cases rc
  where rc.status='OPEN'
  group by rc.member_id
) agg
join lateral (
  select rc.opening_reason, rc.opened_at
  from public.member_review_cases rc
  where rc.member_id=agg.member_id and rc.status='OPEN'
  order by rc.opened_at, rc.id
  limit 1
) first_case on true;

revoke all on table public.member_review_cases from public, anon, authenticated, service_role;
revoke all on table public.admin_member_review_summary from public, anon, authenticated, service_role;
grant select on table public.member_review_cases to service_role;
grant select on table public.admin_member_review_summary to service_role;

-- Seed one open legacy case for every live period still carrying migration_review=true.
-- This is intentionally idempotent and changes no entitlement or legacy-review flag.
with seed_source as (
  select
    mp.member_id,
    mp.id as membership_period_id,
    case
      when mp.entitlement_type='complimentary' and mp.expiry_mode='manual_no_expiry'
        and mp.removal_protected then 'membership'
      when mp.entitlement_type='paid' and mp.starts_on is null and exists (
        select 1 from public.current_member_status cms
        where cms.member_id=mp.member_id and cms.membership_period_id=mp.id and cms.status='ACTIVE'
      ) then 'membership'
      else 'historical'
    end as category,
    case
      when mp.entitlement_type='complimentary' and mp.expiry_mode='manual_no_expiry'
        and mp.removal_protected then 'Protected indefinite complimentary access requires confirmation.'
      when mp.entitlement_type='paid' and mp.starts_on is null and exists (
        select 1 from public.current_member_status cms
        where cms.member_id=mp.member_id and cms.membership_period_id=mp.id and cms.status='ACTIVE'
      ) then 'Active paid membership start date is missing and requires reconciliation.'
      when m.first_joined_on is not null and mp.expires_on is not null
        and m.first_joined_on > mp.expires_on then 'Legacy relationship date occurs after recorded membership expiry and requires review.'
      when mp.starts_on is null then 'Historical membership start date unavailable from migrated source.'
      when mp.starts_on is not null and mp.expires_on is not null
        and mp.expires_on <= mp.starts_on then 'Historical membership dates are inconsistent and require review.'
      when mp.source='legacy_history_reconstruction'
        or position('review' in lower(coalesce(mp.legacy_notes,''))) > 0
        then 'Historical payment/membership classification requires confirmation.'
      else 'Legacy migration record requires manual review.'
    end as opening_reason
  from public.membership_periods mp
  join public.members m on m.id=mp.member_id
  where mp.migration_review=true
),
inserted_cases as (
  insert into public.member_review_cases(
    member_id, membership_period_id, origin, category,
    opening_reason, status, opened_by
  )
  select
    ss.member_id, ss.membership_period_id, 'legacy_migration', ss.category,
    ss.opening_reason, 'OPEN', 'system/review-case-migration-2026-10-01'
  from seed_source ss
  where not exists (
    select 1 from public.member_review_cases rc
    where rc.origin='legacy_migration'
      and rc.membership_period_id=ss.membership_period_id
  )
  returning *
),
inserted_events as (
  insert into public.membership_events(
    member_id, membership_period_id, event_type, reason,
    actor_type, actor_id, metadata
  )
  select
    ic.member_id, ic.membership_period_id, 'REVIEW_OPENED', ic.opening_reason,
    'system', ic.opened_by,
    jsonb_strip_nulls(jsonb_build_object(
      'review_case_id', ic.id,
      'origin', ic.origin,
      'category', ic.category,
      'membership_period_id', ic.membership_period_id,
      'payment_id', ic.payment_id
    ))
  from inserted_cases ic
  returning id
)
insert into public.audit_log(
  actor_type, actor_id, action, entity_type, entity_id,
  before_data, after_data, reason
)
select
  'system', ic.opened_by, 'REVIEW_OPENED', 'member_review_case', ic.id::text,
  null, to_jsonb(ic), ic.opening_reason
from inserted_cases ic;

create or replace function public.admin_open_member_review_case(
  p_member_id uuid,
  p_membership_period_id uuid,
  p_payment_id uuid,
  p_category text,
  p_reason text,
  p_actor_id text
) returns table(review_case_id uuid, review_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
  v_reason text;
  v_actor text;
  v_case public.member_review_cases%rowtype;
  v_event_period_id uuid;
begin
  if p_member_id is null or num_nonnulls(p_membership_period_id,p_payment_id) > 1 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  v_category := lower(btrim(coalesce(p_category,'')));
  v_reason := btrim(coalesce(p_reason,''));
  v_actor := coalesce(nullif(btrim(p_actor_id),''), 'vip-admin');
  if v_category not in ('identity_contact','membership','payment','telegram','historical','other')
     or v_reason='' or char_length(v_reason)>500 or char_length(v_actor)>200 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  perform 1 from public.members m where m.id=p_member_id;
  if not found then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;

  if p_membership_period_id is not null then
    perform 1 from public.membership_periods mp
    where mp.id=p_membership_period_id and mp.member_id=p_member_id;
    if not found then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
    v_event_period_id := p_membership_period_id;
  elsif p_payment_id is not null then
    select p.membership_period_id into v_event_period_id
    from public.payments p
    where p.id=p_payment_id and p.member_id=p_member_id;
    if not found then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
  end if;

  begin
    insert into public.member_review_cases(
      member_id, membership_period_id, payment_id, origin, category,
      opening_reason, status, opened_by
    ) values (
      p_member_id, p_membership_period_id, p_payment_id, 'manual', v_category,
      v_reason, 'OPEN', v_actor
    ) returning * into v_case;
  exception when unique_violation then
    raise exception using errcode='P0001', message='DUPLICATE_REVIEW_CASE';
  end;

  insert into public.membership_events(
    member_id, membership_period_id, event_type, reason,
    actor_type, actor_id, metadata
  ) values (
    p_member_id, v_event_period_id, 'REVIEW_OPENED', v_reason,
    'admin', v_actor,
    jsonb_strip_nulls(jsonb_build_object(
      'review_case_id', v_case.id,
      'origin', v_case.origin,
      'category', v_case.category,
      'membership_period_id', v_case.membership_period_id,
      'payment_id', v_case.payment_id
    ))
  );

  insert into public.audit_log(
    actor_type, actor_id, action, entity_type, entity_id,
    before_data, after_data, reason
  ) values (
    'admin', v_actor, 'REVIEW_OPENED', 'member_review_case', v_case.id::text,
    null, to_jsonb(v_case), v_reason
  );

  return query select v_case.id, v_case.status;
end;
$$;

create or replace function public.admin_resolve_member_review_case(
  p_case_id uuid,
  p_member_id uuid,
  p_resolution_outcome text,
  p_resolution_note text,
  p_actor_id text
) returns table(review_case_id uuid, review_status text, membership_period_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.member_review_cases%rowtype;
  v_after public.member_review_cases%rowtype;
  v_outcome text;
  v_note text;
  v_actor text;
  v_event_period_id uuid;
  v_legacy_flag_cleared boolean := false;
begin
  if p_case_id is null or p_member_id is null then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  v_outcome := upper(btrim(coalesce(p_resolution_outcome,'')));
  v_note := btrim(coalesce(p_resolution_note,''));
  v_actor := coalesce(nullif(btrim(p_actor_id),''), 'vip-admin');
  if v_outcome not in ('CORRECTED_DATA_UPDATED','EXISTING_DATA_CONFIRMED','HISTORICAL_DETAIL_UNKNOWN_ACCEPTED')
     or v_note='' or char_length(v_note)>500 or char_length(v_actor)>200 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  select rc.* into v_case
  from public.member_review_cases rc
  where rc.id=p_case_id and rc.member_id=p_member_id
  for update;
  if not found then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
  if v_case.status <> 'OPEN' then
    raise exception using errcode='P0001', message='REVIEW_CASE_NOT_OPEN';
  end if;

  v_event_period_id := v_case.membership_period_id;
  if v_event_period_id is null and v_case.payment_id is not null then
    select p.membership_period_id into v_event_period_id
    from public.payments p where p.id=v_case.payment_id;
  end if;

  if v_case.origin='legacy_migration' and v_case.membership_period_id is not null then
    update public.membership_periods mp
    set migration_review=false
    where mp.id=v_case.membership_period_id and mp.member_id=p_member_id;
    if not found then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
    v_legacy_flag_cleared := true;
  end if;

  update public.member_review_cases
  set status='RESOLVED',
      resolution_outcome=v_outcome,
      resolution_note=v_note,
      resolved_at=now(),
      resolved_by=v_actor
  where id=v_case.id
  returning * into v_after;

  insert into public.membership_events(
    member_id, membership_period_id, event_type, reason,
    actor_type, actor_id, metadata
  ) values (
    p_member_id, v_event_period_id, 'REVIEW_RESOLVED', v_note,
    'admin', v_actor,
    jsonb_strip_nulls(jsonb_build_object(
      'review_case_id', v_case.id,
      'origin', v_case.origin,
      'category', v_case.category,
      'resolution_outcome', v_outcome,
      'membership_period_id', v_case.membership_period_id,
      'payment_id', v_case.payment_id,
      'legacy_migration_flag_cleared', v_legacy_flag_cleared
    ))
  );

  insert into public.audit_log(
    actor_type, actor_id, action, entity_type, entity_id,
    before_data, after_data, reason
  ) values (
    'admin', v_actor, 'REVIEW_RESOLVED', 'member_review_case', v_case.id::text,
    to_jsonb(v_case), to_jsonb(v_after), v_note
  );

  return query select v_after.id, v_after.status, v_after.membership_period_id;
end;
$$;

revoke all on function public.admin_open_member_review_case(uuid,uuid,uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.admin_resolve_member_review_case(uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_open_member_review_case(uuid,uuid,uuid,text,text,text)
  to service_role;
grant execute on function public.admin_resolve_member_review_case(uuid,uuid,text,text,text)
  to service_role;


create or replace function public.admin_update_member_details(
  p_member_id uuid,
  p_expected jsonb,
  p_proposed jsonb,
  p_reason text,
  p_actor_id text
) returns table(member_id uuid, event_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members%rowtype;
  v_display_name text;
  v_email text;
  v_first_joined_on date;
  v_first_joined_text text;
  v_admin_notes text;
  v_marketing_status text;
  v_reason text;
  v_actor text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_event_id uuid;
begin
  if p_member_id is null or p_expected is null or p_proposed is null
     or jsonb_typeof(p_expected)<>'object' or jsonb_typeof(p_proposed)<>'object' then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  if not (p_expected ?& array['display_name','email','first_joined_on','admin_notes','marketing_status'])
     or not (p_proposed ?& array['display_name','email','first_joined_on','admin_notes','marketing_status'])
     or (select count(*) from jsonb_object_keys(p_expected)) <> 5
     or (select count(*) from jsonb_object_keys(p_proposed)) <> 5 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  v_display_name := regexp_replace(btrim(coalesce(p_proposed->>'display_name','')), '[[:space:]]+', ' ', 'g');
  if v_display_name='' or char_length(v_display_name)>200 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  v_email := nullif(lower(btrim(coalesce(p_proposed->>'email',''))),'');
  if v_email is not null and (
    char_length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;

  v_first_joined_text := nullif(btrim(coalesce(p_proposed->>'first_joined_on','')),'');
  if v_first_joined_text is not null then
    if v_first_joined_text !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception using errcode='P0001', message='INVALID_INPUT';
    end if;
    begin
      v_first_joined_on := v_first_joined_text::date;
    exception when others then
      raise exception using errcode='P0001', message='INVALID_INPUT';
    end;
    if v_first_joined_on::text <> v_first_joined_text then
      raise exception using errcode='P0001', message='INVALID_INPUT';
    end if;
  end if;

  v_admin_notes := nullif(btrim(coalesce(p_proposed->>'admin_notes','')),'');
  if v_admin_notes is not null and char_length(v_admin_notes)>4000 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  v_marketing_status := lower(btrim(coalesce(p_proposed->>'marketing_status','')));
  if v_marketing_status not in ('unknown','allowed','opted_out') then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason,'')),'');
  if v_reason is not null and char_length(v_reason)>500 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  v_actor := coalesce(nullif(btrim(p_actor_id),''),'vip-admin');
  if char_length(v_actor)>200 then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;

  -- Share Add Member's identity lock so create/edit duplicate checks cannot race.
  perform pg_advisory_xact_lock(hashtext('cryptomainly_admin_create_member'));

  select m.* into v_member from public.members m where m.id=p_member_id for update;
  if not found then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;

  if v_member.display_name is distinct from (p_expected->>'display_name')
     or v_member.email is distinct from (p_expected->>'email')
     or v_member.first_joined_on::text is distinct from (p_expected->>'first_joined_on')
     or v_member.admin_notes is distinct from (p_expected->>'admin_notes')
     or v_member.marketing_status is distinct from (p_expected->>'marketing_status') then
    raise exception using errcode='P0001', message='STALE_PREVIEW';
  end if;

  if v_member.display_name is distinct from v_display_name then
    v_before := v_before || jsonb_build_object('display_name',v_member.display_name);
    v_after := v_after || jsonb_build_object('display_name',v_display_name);
  end if;
  if v_member.email is distinct from v_email then
    v_before := v_before || jsonb_build_object('email',v_member.email);
    v_after := v_after || jsonb_build_object('email',v_email);
  end if;
  if v_member.first_joined_on is distinct from v_first_joined_on then
    v_before := v_before || jsonb_build_object('first_joined_on',v_member.first_joined_on);
    v_after := v_after || jsonb_build_object('first_joined_on',v_first_joined_on);
    if v_reason is null then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
  end if;
  if v_member.admin_notes is distinct from v_admin_notes then
    v_before := v_before || jsonb_build_object('admin_notes',v_member.admin_notes);
    v_after := v_after || jsonb_build_object('admin_notes',v_admin_notes);
  end if;
  if v_member.marketing_status is distinct from v_marketing_status then
    v_before := v_before || jsonb_build_object('marketing_status',v_member.marketing_status);
    v_after := v_after || jsonb_build_object('marketing_status',v_marketing_status);
  end if;
  if v_before='{}'::jsonb then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;

  if v_email is not null and exists (
    select 1 from public.members m
    where m.id<>p_member_id and lower(btrim(coalesce(m.email,'')))=v_email
  ) then raise exception using errcode='P0001', message='DUPLICATE_EMAIL'; end if;

  update public.members
  set display_name=v_display_name,
      email=v_email,
      first_joined_on=v_first_joined_on,
      admin_notes=v_admin_notes,
      marketing_status=v_marketing_status,
      updated_at=now()
  where id=p_member_id;

  insert into public.membership_events(
    member_id,event_type,reason,actor_type,actor_id,metadata
  ) values (
    p_member_id,'MEMBER_DETAILS_UPDATED',v_reason,'admin',v_actor,
    jsonb_build_object('before',v_before,'after',v_after)
  ) returning id into v_event_id;

  insert into public.audit_log(
    actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
  ) values (
    'admin',v_actor,'MEMBER_DETAILS_UPDATED','member',p_member_id::text,
    v_before,v_after,v_reason
  );

  return query select p_member_id,v_event_id;
end;
$$;


create or replace function public.admin_update_telegram_username(
  p_member_id uuid,
  p_telegram_account_id uuid,
  p_expected_username text,
  p_new_username text,
  p_reason text,
  p_actor_id text
) returns table(telegram_account_id uuid, event_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.telegram_accounts%rowtype;
  v_account_id uuid;
  v_expected text;
  v_current text;
  v_new text;
  v_reason text;
  v_actor text;
  v_event_id uuid;
begin
  if p_member_id is null then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
  v_expected := nullif(lower(regexp_replace(btrim(coalesce(p_expected_username,'')),'^@','')),'');
  v_new := nullif(lower(regexp_replace(btrim(coalesce(p_new_username,'')),'^@','')),'');
  if v_expected is not null and (
    char_length(v_expected)<5 or char_length(v_expected)>32 or v_expected !~ '^[a-z0-9_]+$'
  ) then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
  if v_new is not null and (
    char_length(v_new)<5 or char_length(v_new)>32 or v_new !~ '^[a-z0-9_]+$'
  ) then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;

  v_reason := nullif(btrim(coalesce(p_reason,'')),'');
  if v_reason is not null and char_length(v_reason)>500 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  v_actor := coalesce(nullif(btrim(p_actor_id),''),'vip-admin');
  if char_length(v_actor)>200 then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;

  perform pg_advisory_xact_lock(hashtext('cryptomainly_admin_create_member'));
  perform 1 from public.members m where m.id=p_member_id;
  if not found then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;

  if p_telegram_account_id is not null then
    select ta.* into v_account
    from public.telegram_accounts ta
    where ta.id=p_telegram_account_id and ta.member_id=p_member_id
    for update;
    if not found then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
    v_current := nullif(lower(regexp_replace(btrim(coalesce(v_account.telegram_username,'')),'^@','')),'');
    if v_current is distinct from v_expected then
      raise exception using errcode='P0001', message='STALE_PREVIEW';
    end if;
    if v_current is not distinct from v_new then
      raise exception using errcode='P0001', message='INVALID_INPUT';
    end if;
    v_account_id := v_account.id;
  else
    if v_expected is not null then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
    if exists(select 1 from public.telegram_accounts ta where ta.member_id=p_member_id) then
      raise exception using errcode='P0001', message='STALE_PREVIEW';
    end if;
    if v_new is null then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
  end if;

  if v_new is not null and exists (
    select 1 from public.telegram_accounts ta
    where (v_account_id is null or ta.id<>v_account_id)
      and nullif(lower(regexp_replace(btrim(coalesce(ta.telegram_username,'')),'^@','')),'')=v_new
  ) then raise exception using errcode='P0001', message='DUPLICATE_TELEGRAM'; end if;

  if v_account_id is null then
    insert into public.telegram_accounts(
      member_id,telegram_user_id,telegram_username,telegram_raw,
      bot_started_at,linked_at,dm_available,last_verified_at
    ) values (
      p_member_id,null,v_new,null,null,null,false,null
    ) returning id into v_account_id;
  else
    update public.telegram_accounts
    set telegram_username=v_new
    where id=v_account_id;
  end if;

  insert into public.membership_events(
    member_id,event_type,reason,actor_type,actor_id,metadata
  ) values (
    p_member_id,'TELEGRAM_USERNAME_UPDATED',v_reason,'admin',v_actor,
    jsonb_build_object(
      'telegram_account_id',v_account_id,
      'before',jsonb_build_object('telegram_username',v_current),
      'after',jsonb_build_object('telegram_username',v_new)
    )
  ) returning id into v_event_id;

  insert into public.audit_log(
    actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
  ) values (
    'admin',v_actor,'TELEGRAM_USERNAME_UPDATED','telegram_account',v_account_id::text,
    jsonb_build_object('telegram_username',v_current),
    jsonb_build_object('telegram_username',v_new),v_reason
  );

  return query select v_account_id,v_event_id;
end;
$$;

revoke all on function public.admin_update_member_details(uuid,jsonb,jsonb,text,text)
  from public, anon, authenticated;
revoke all on function public.admin_update_telegram_username(uuid,uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_update_member_details(uuid,jsonb,jsonb,text,text)
  to service_role;
grant execute on function public.admin_update_telegram_username(uuid,uuid,text,text,text,text)
  to service_role;


create or replace function public.admin_correct_membership_period(
  p_member_id uuid,
  p_period_id uuid,
  p_expected jsonb,
  p_proposed jsonb,
  p_reason text,
  p_actor_id text
) returns table(membership_period_id uuid, event_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.membership_periods%rowtype;
  v_current jsonb;
  v_entitlement_type text;
  v_plan_name text;
  v_starts_on date;
  v_expires_on date;
  v_expiry_mode text;
  v_removal_protected boolean;
  v_protection_reason text;
  v_ended_early_on date;
  v_admin_note text;
  v_reason text;
  v_actor text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_interval_changed boolean := false;
  v_event_id uuid;
  v_text text;
begin
  if p_member_id is null or p_period_id is null or p_expected is null or p_proposed is null
     or jsonb_typeof(p_expected)<>'object' or jsonb_typeof(p_proposed)<>'object' then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  if not (p_expected ?& array[
    'entitlement_type','plan_name','starts_on','expires_on','expiry_mode',
    'removal_protected','protection_reason','ended_early_on','admin_note'
  ]) or not (p_proposed ?& array[
    'entitlement_type','plan_name','starts_on','expires_on','expiry_mode',
    'removal_protected','protection_reason','ended_early_on','admin_note'
  ]) or (select count(*) from jsonb_object_keys(p_expected))<>9
     or (select count(*) from jsonb_object_keys(p_proposed))<>9 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  v_reason := btrim(coalesce(p_reason,''));
  v_actor := coalesce(nullif(btrim(p_actor_id),''),'vip-admin');
  if v_reason='' or char_length(v_reason)>500 or char_length(v_actor)>200 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  select mp.* into v_period from public.membership_periods mp
  where mp.id=p_period_id and mp.member_id=p_member_id for update;
  if not found then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;

  v_current := jsonb_build_object(
    'entitlement_type',v_period.entitlement_type,'plan_name',v_period.plan_name,
    'starts_on',v_period.starts_on,'expires_on',v_period.expires_on,
    'expiry_mode',v_period.expiry_mode,'removal_protected',v_period.removal_protected,
    'protection_reason',v_period.protection_reason,'ended_early_on',v_period.ended_early_on,
    'admin_note',v_period.admin_note
  );
  if v_current is distinct from p_expected then
    raise exception using errcode='P0001', message='STALE_PREVIEW';
  end if;

  v_entitlement_type := lower(btrim(coalesce(p_proposed->>'entitlement_type','')));
  if v_entitlement_type not in ('paid','complimentary','trial','lifetime','admin') then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  v_plan_name := nullif(btrim(coalesce(p_proposed->>'plan_name','')),'');
  if v_plan_name is not null and char_length(v_plan_name)>200 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  v_expiry_mode := lower(btrim(coalesce(p_proposed->>'expiry_mode','')));
  if v_expiry_mode not in ('fixed','lifetime','manual_no_expiry') then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  if jsonb_typeof(p_proposed->'removal_protected')<>'boolean' then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  v_removal_protected := (p_proposed->>'removal_protected')::boolean;
  v_protection_reason := nullif(btrim(coalesce(p_proposed->>'protection_reason','')),'');
  if v_protection_reason is not null and char_length(v_protection_reason)>500 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  if v_removal_protected and v_protection_reason is null then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  elsif not v_removal_protected then
    v_protection_reason := null;
  end if;
  v_admin_note := nullif(btrim(coalesce(p_proposed->>'admin_note','')),'');
  if v_admin_note is not null and char_length(v_admin_note)>4000 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  v_text := nullif(btrim(coalesce(p_proposed->>'starts_on','')),'');
  if v_text is not null then
    if v_text !~ '^\d{4}-\d{2}-\d{2}$' then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
    begin v_starts_on := v_text::date;
    exception when others then raise exception using errcode='P0001', message='INVALID_INPUT'; end;
    if v_starts_on::text<>v_text then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
  end if;

  v_text := nullif(btrim(coalesce(p_proposed->>'expires_on','')),'');
  if v_text is not null then
    if v_text !~ '^\d{4}-\d{2}-\d{2}$' then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
    begin v_expires_on := v_text::date;
    exception when others then raise exception using errcode='P0001', message='INVALID_INPUT'; end;
    if v_expires_on::text<>v_text then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
  end if;

  v_text := nullif(btrim(coalesce(p_proposed->>'ended_early_on','')),'');
  if v_text is not null then
    if v_text !~ '^\d{4}-\d{2}-\d{2}$' then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
    begin v_ended_early_on := v_text::date;
    exception when others then raise exception using errcode='P0001', message='INVALID_INPUT'; end;
    if v_ended_early_on::text<>v_text then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
  end if;

  if v_expiry_mode<>'fixed' and v_expires_on is not null then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  if v_starts_on is not null and v_expires_on is not null and v_expires_on<=v_starts_on then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  if v_ended_early_on is not null and v_starts_on is not null and v_ended_early_on<v_starts_on then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  if v_ended_early_on is not null and v_expires_on is not null and v_ended_early_on>v_expires_on then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  if v_period.entitlement_type is distinct from v_entitlement_type then
    v_before:=v_before||jsonb_build_object('entitlement_type',v_period.entitlement_type);
    v_after:=v_after||jsonb_build_object('entitlement_type',v_entitlement_type);
  end if;
  if v_period.plan_name is distinct from v_plan_name then
    v_before:=v_before||jsonb_build_object('plan_name',v_period.plan_name);
    v_after:=v_after||jsonb_build_object('plan_name',v_plan_name);
  end if;
  if v_period.starts_on is distinct from v_starts_on then
    v_before:=v_before||jsonb_build_object('starts_on',v_period.starts_on);
    v_after:=v_after||jsonb_build_object('starts_on',v_starts_on);
    v_interval_changed:=true;
  end if;
  if v_period.expires_on is distinct from v_expires_on then
    v_before:=v_before||jsonb_build_object('expires_on',v_period.expires_on);
    v_after:=v_after||jsonb_build_object('expires_on',v_expires_on);
    v_interval_changed:=true;
  end if;
  if v_period.expiry_mode is distinct from v_expiry_mode then
    v_before:=v_before||jsonb_build_object('expiry_mode',v_period.expiry_mode);
    v_after:=v_after||jsonb_build_object('expiry_mode',v_expiry_mode);
    v_interval_changed:=true;
  end if;
  if v_period.removal_protected is distinct from v_removal_protected then
    v_before:=v_before||jsonb_build_object('removal_protected',v_period.removal_protected);
    v_after:=v_after||jsonb_build_object('removal_protected',v_removal_protected);
  end if;
  if v_period.protection_reason is distinct from v_protection_reason then
    v_before:=v_before||jsonb_build_object('protection_reason',v_period.protection_reason);
    v_after:=v_after||jsonb_build_object('protection_reason',v_protection_reason);
  end if;
  if v_period.ended_early_on is distinct from v_ended_early_on then
    v_before:=v_before||jsonb_build_object('ended_early_on',v_period.ended_early_on);
    v_after:=v_after||jsonb_build_object('ended_early_on',v_ended_early_on);
    v_interval_changed:=true;
  end if;
  if v_period.admin_note is distinct from v_admin_note then
    v_before:=v_before||jsonb_build_object('admin_note',v_period.admin_note);
    v_after:=v_after||jsonb_build_object('admin_note',v_admin_note);
  end if;

  if v_before='{}'::jsonb then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;

  if v_interval_changed and exists (
    select 1 from public.membership_periods other
    where other.member_id=p_member_id and other.id<>p_period_id
      and coalesce(other.starts_on,'-infinity'::date)
          <= coalesce(v_ended_early_on,v_expires_on,'infinity'::date)
      and coalesce(other.ended_early_on,other.expires_on,'infinity'::date)
          >= coalesce(v_starts_on,'-infinity'::date)
  ) then raise exception using errcode='P0001', message='OVERLAPPING_ENTITLEMENT'; end if;

  update public.membership_periods
  set entitlement_type=v_entitlement_type,
      plan_name=v_plan_name,
      starts_on=v_starts_on,
      expires_on=v_expires_on,
      expiry_mode=v_expiry_mode,
      removal_protected=v_removal_protected,
      protection_reason=v_protection_reason,
      ended_early_on=v_ended_early_on,
      admin_note=v_admin_note,
      note_updated_at=case when v_period.admin_note is distinct from v_admin_note then now() else note_updated_at end,
      note_updated_by=case when v_period.admin_note is distinct from v_admin_note then v_actor else note_updated_by end
  where id=p_period_id;

  insert into public.membership_events(
    member_id,membership_period_id,event_type,old_expiry,new_expiry,reason,
    actor_type,actor_id,metadata
  ) values (
    p_member_id,p_period_id,'MEMBERSHIP_PERIOD_CORRECTED',
    case when v_period.expires_on is distinct from v_expires_on then v_period.expires_on else null end,
    case when v_period.expires_on is distinct from v_expires_on then v_expires_on else null end,
    v_reason,'admin',v_actor,jsonb_build_object('before',v_before,'after',v_after)
  ) returning id into v_event_id;

  insert into public.audit_log(
    actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
  ) values (
    'admin',v_actor,'MEMBERSHIP_PERIOD_CORRECTED','membership_period',p_period_id::text,
    v_before,v_after,v_reason
  );

  return query select p_period_id,v_event_id;
end;
$$;


create or replace function public.admin_correct_payment(
  p_member_id uuid,
  p_payment_id uuid,
  p_expected jsonb,
  p_proposed jsonb,
  p_reason text,
  p_actor_id text
) returns table(payment_id uuid, event_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_amount numeric;
  v_currency text;
  v_network text;
  v_tx_hash text;
  v_status text;
  v_received_at timestamptz;
  v_expected_received_at timestamptz;
  v_notes text;
  v_reason text;
  v_actor text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_event_id uuid;
  v_text text;
begin
  if p_member_id is null or p_payment_id is null or p_expected is null or p_proposed is null
     or jsonb_typeof(p_expected)<>'object' or jsonb_typeof(p_proposed)<>'object' then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  if not (p_expected ?& array['amount','currency','network','tx_hash','status','received_at','notes'])
     or not (p_proposed ?& array['amount','currency','network','tx_hash','status','received_at','notes'])
     or (select count(*) from jsonb_object_keys(p_expected))<>7
     or (select count(*) from jsonb_object_keys(p_proposed))<>7 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  v_reason := btrim(coalesce(p_reason,''));
  v_actor := coalesce(nullif(btrim(p_actor_id),''),'vip-admin');
  if v_reason='' or char_length(v_reason)>500 or char_length(v_actor)>200 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  v_text := nullif(btrim(coalesce(p_expected->>'received_at','')),'');
  if v_text is not null then
    if v_text !~ '(Z|[+-]\d{2}:\d{2})$' then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
    begin v_expected_received_at:=v_text::timestamptz;
    exception when others then raise exception using errcode='P0001', message='INVALID_INPUT'; end;
  end if;

  select p.* into v_payment from public.payments p
  where p.id=p_payment_id and p.member_id=p_member_id for update;
  if not found then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;

  if (jsonb_typeof(p_expected->'amount') not in ('number','null'))
     or (jsonb_build_object('value',v_payment.amount)->'value') is distinct from p_expected->'amount'
     or v_payment.currency is distinct from p_expected->>'currency'
     or v_payment.network is distinct from p_expected->>'network'
     or v_payment.tx_hash is distinct from p_expected->>'tx_hash'
     or v_payment.status is distinct from p_expected->>'status'
     or v_payment.received_at is distinct from v_expected_received_at
     or v_payment.notes is distinct from p_expected->>'notes' then
    raise exception using errcode='P0001', message='STALE_PREVIEW';
  end if;

  if jsonb_typeof(p_proposed->'amount') not in ('number','null') then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  if jsonb_typeof(p_proposed->'amount')='number' then
    begin v_amount:=(p_proposed->>'amount')::numeric;
    exception when others then raise exception using errcode='P0001', message='INVALID_INPUT'; end;
    if v_amount<=0 then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
  end if;

  v_currency:=nullif(upper(btrim(coalesce(p_proposed->>'currency',''))),'');
  if v_currency is not null and (
    char_length(v_currency)>12 or v_currency !~ '^[A-Z0-9_-]+$'
  ) then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
  v_network:=nullif(btrim(coalesce(p_proposed->>'network','')),'');
  if v_network is not null and char_length(v_network)>100 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  v_tx_hash:=nullif(btrim(coalesce(p_proposed->>'tx_hash','')),'');
  if v_tx_hash is not null and char_length(v_tx_hash)>300 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  v_status:=lower(btrim(coalesce(p_proposed->>'status','')));
  if v_status not in ('pending','verified','rejected','refunded') then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  v_notes:=nullif(btrim(coalesce(p_proposed->>'notes','')),'');
  if v_notes is not null and char_length(v_notes)>2000 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  v_text:=nullif(btrim(coalesce(p_proposed->>'received_at','')),'');
  if v_text is not null then
    if v_text !~ '(Z|[+-]\d{2}:\d{2})$' then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;
    begin v_received_at:=v_text::timestamptz;
    exception when others then raise exception using errcode='P0001', message='INVALID_INPUT'; end;
  end if;

  if v_payment.amount is distinct from v_amount then
    v_before:=v_before||jsonb_build_object('amount',v_payment.amount);
    v_after:=v_after||jsonb_build_object('amount',v_amount);
  end if;
  if v_payment.currency is distinct from v_currency then
    v_before:=v_before||jsonb_build_object('currency',v_payment.currency);
    v_after:=v_after||jsonb_build_object('currency',v_currency);
  end if;
  if v_payment.network is distinct from v_network then
    v_before:=v_before||jsonb_build_object('network',v_payment.network);
    v_after:=v_after||jsonb_build_object('network',v_network);
  end if;
  if v_payment.tx_hash is distinct from v_tx_hash then
    v_before:=v_before||jsonb_build_object('tx_hash',v_payment.tx_hash);
    v_after:=v_after||jsonb_build_object('tx_hash',v_tx_hash);
  end if;
  if v_payment.status is distinct from v_status then
    v_before:=v_before||jsonb_build_object('status',v_payment.status);
    v_after:=v_after||jsonb_build_object('status',v_status);
  end if;
  if v_payment.received_at is distinct from v_received_at then
    v_before:=v_before||jsonb_build_object('received_at',v_payment.received_at);
    v_after:=v_after||jsonb_build_object('received_at',v_received_at);
  end if;
  if v_payment.notes is distinct from v_notes then
    v_before:=v_before||jsonb_build_object('notes',v_payment.notes);
    v_after:=v_after||jsonb_build_object('notes',v_notes);
  end if;
  if v_before='{}'::jsonb then raise exception using errcode='P0001', message='INVALID_INPUT'; end if;

  if v_tx_hash is not null and exists (
    select 1 from public.payments p where p.id<>p_payment_id and p.tx_hash=v_tx_hash
  ) then raise exception using errcode='P0001', message='DUPLICATE_TX_HASH'; end if;

  begin
    update public.payments
    set amount=v_amount,currency=v_currency,network=v_network,tx_hash=v_tx_hash,
        status=v_status,received_at=v_received_at,notes=v_notes
    where id=p_payment_id;
  exception when unique_violation then
    raise exception using errcode='P0001', message='DUPLICATE_TX_HASH';
  end;

  insert into public.membership_events(
    member_id,membership_period_id,event_type,reason,actor_type,actor_id,metadata
  ) values (
    p_member_id,v_payment.membership_period_id,'PAYMENT_CORRECTED',v_reason,
    'admin',v_actor,jsonb_build_object('payment_id',p_payment_id,'before',v_before,'after',v_after)
  ) returning id into v_event_id;

  insert into public.audit_log(
    actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
  ) values (
    'admin',v_actor,'PAYMENT_CORRECTED','payment',p_payment_id::text,
    v_before,v_after,v_reason
  );

  return query select p_payment_id,v_event_id;
end;
$$;

revoke all on function public.admin_correct_membership_period(uuid,uuid,jsonb,jsonb,text,text)
  from public, anon, authenticated;
revoke all on function public.admin_correct_payment(uuid,uuid,jsonb,jsonb,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_correct_membership_period(uuid,uuid,jsonb,jsonb,text,text)
  to service_role;
grant execute on function public.admin_correct_payment(uuid,uuid,jsonb,jsonb,text,text)
  to service_role;
