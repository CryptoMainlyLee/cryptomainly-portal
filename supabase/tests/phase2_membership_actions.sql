-- Rollback-only regression suite for CryptoMainly Phase 2 membership actions.
-- Safe to run repeatedly: all synthetic writes are rolled back.

begin;

do $$
declare
  v_active_member uuid := gen_random_uuid();
  v_active_period uuid := gen_random_uuid();
  v_comp_member uuid := gen_random_uuid();
  v_comp_period uuid := gen_random_uuid();
  v_former_member uuid := gen_random_uuid();
  v_former_period uuid := gen_random_uuid();
  v_today date := (now() at time zone 'Europe/London')::date;
  v_active_expiry date := ((now() at time zone 'Europe/London')::date + 60);
  v_former_expiry date := ((now() at time zone 'Europe/London')::date - 10);
  v_result record;
  v_count integer;
begin
  -- Seven verified live legacy relationship start events must exist exactly once.
  select count(*) into v_count
  from public.membership_events e
  join public.members m on m.id=e.member_id
  where e.event_type='LEGACY_RELATIONSHIP_STARTED'
    and m.legacy_member_code between 'CM-068' and 'CM-074'
    and e.membership_period_id is null
    and e.metadata->>'source_sheet'='Copy of NFT'
    and e.metadata->>'source_column'='B'
    and e.metadata->>'continuity_unknown'='true';
  if v_count <> 7 then raise exception 'Expected 7 legacy relationship start events, found %', v_count; end if;

  -- Function signatures and calendar math.
  if to_regprocedure('public.admin_change_membership_expiry(uuid,uuid,date,date,text,boolean,text)') is null then raise exception 'Missing change expiry RPC'; end if;
  if to_regprocedure('public.admin_add_membership_time(uuid,uuid,date,integer,text,text,text)') is null then raise exception 'Missing add time RPC'; end if;
  if to_regprocedure('public.admin_renew_active_membership(uuid,uuid,date,integer,text,numeric,text,date,text,text,text,text)') is null then raise exception 'Missing active renew RPC'; end if;
  if to_regprocedure('public.admin_reactivate_membership(uuid,uuid,date,date,integer,text,numeric,text,date,text,text,text,text)') is null then raise exception 'Missing reactivation RPC'; end if;
  if public.cm_add_membership_duration('2027-01-31',1,'months') <> '2027-02-28' then raise exception 'Calendar clamp failed'; end if;
  if public.cm_add_membership_duration('2028-01-31',1,'months') <> '2028-02-29' then raise exception 'Leap-year clamp failed'; end if;
  if public.cm_add_membership_duration('2027-01-31',2,'months') <> '2027-03-31' then raise exception 'Multi-month interval failed'; end if;

  -- Synthetic members avoid touching real entitlements.
  insert into public.members(id,display_name,source_system) values
    (v_active_member,'Phase2 Test Active Paid','phase2_test'),
    (v_comp_member,'Phase2 Test Active Complimentary','phase2_test'),
    (v_former_member,'Phase2 Test Former','phase2_test');

  insert into public.membership_periods(id,member_id,entitlement_type,source,starts_on,expires_on,expiry_mode) values
    (v_active_period,v_active_member,'paid','phase2_test',v_today-30,v_active_expiry,'fixed'),
    (v_comp_period,v_comp_member,'complimentary','phase2_test',v_today-30,v_active_expiry,'fixed'),
    (v_former_period,v_former_member,'paid','phase2_test',v_today-100,v_former_expiry,'fixed');

  -- Change expiry success + immutable records.
  select * into v_result from public.admin_change_membership_expiry(
    v_active_member,v_active_period,v_active_expiry,v_active_expiry+7,'Test expiry adjustment',false,'phase2-test');
  if v_result.new_expiry <> v_active_expiry+7 then raise exception 'Change Expiry failed'; end if;
  if not exists(select 1 from public.membership_events where id=v_result.event_id and event_type='EXPIRY_CHANGED') then raise exception 'Expiry event missing'; end if;
  if not exists(select 1 from public.audit_log where action='EXPIRY_CHANGED' and entity_id=v_active_period::text) then raise exception 'Expiry audit missing'; end if;

  -- Restore authoritative date for following tests inside this rollback transaction.
  update public.membership_periods set expires_on=v_active_expiry where id=v_active_period;

  -- Stale preview rejection.
  begin
    perform * from public.admin_change_membership_expiry(v_active_member,v_active_period,v_active_expiry-1,v_active_expiry+10,'Stale test',false,'phase2-test');
    raise exception 'Expected STALE_PREVIEW';
  exception when others then
    if sqlerrm <> 'STALE_PREVIEW' then raise; end if;
  end;

  -- Past expiry requires acknowledgement, then succeeds when acknowledged.
  begin
    perform * from public.admin_change_membership_expiry(v_active_member,v_active_period,v_active_expiry,v_today-1,'Past expiry test',false,'phase2-test');
    raise exception 'Expected PAST_EXPIRY_ACK_REQUIRED';
  exception when others then
    if sqlerrm <> 'PAST_EXPIRY_ACK_REQUIRED' then raise; end if;
  end;
  select * into v_result from public.admin_change_membership_expiry(v_active_member,v_active_period,v_active_expiry,v_today-1,'Past expiry accepted',true,'phase2-test');
  if v_result.new_expiry <> v_today-1 then raise exception 'Acknowledged past expiry failed'; end if;
  update public.membership_periods set expires_on=v_active_expiry where id=v_active_period;

  -- A former member's selected fixed-expiry period can be corrected without reactivation.
  select * into v_result from public.admin_change_membership_expiry(
    v_former_member,v_former_period,v_former_expiry,v_today+30,'Administrative expiry correction',false,'phase2-test');
  if v_result.new_expiry <> v_today+30 then raise exception 'Former expiry correction failed'; end if;
  if not exists(select 1 from public.membership_events where id=v_result.event_id and event_type='EXPIRY_CHANGED') then raise exception 'Former expiry correction event missing'; end if;
  update public.membership_periods set expires_on=v_former_expiry where id=v_former_period;

  -- Add Time extends from current expiry and creates no payment.
  select count(*) into v_count from public.payments where member_id=v_active_member;
  select * into v_result from public.admin_add_membership_time(v_active_member,v_active_period,v_active_expiry,1,'months','Goodwill extension','phase2-test');
  if v_result.new_expiry <> public.cm_add_membership_duration(v_active_expiry,1,'months') then raise exception 'Add Time failed'; end if;
  if (select count(*) from public.payments where member_id=v_active_member) <> v_count then raise exception 'Add Time created a payment'; end if;
  update public.membership_periods set expires_on=v_active_expiry where id=v_active_period;

  -- Active paid renewal creates payment and extends from expiry.
  select * into v_result from public.admin_renew_active_membership(
    v_active_member,v_active_period,v_active_expiry,12,'months',500,'usdt',v_today,'phase2-test-renew',null,'Annual renewal','phase2-test');
  if v_result.new_expiry <> public.cm_add_membership_duration(v_active_expiry,12,'months') then raise exception 'Active renewal failed'; end if;
  if not exists(select 1 from public.payments where id=v_result.payment_id and status='verified' and verification_method='manual' and currency='USDT') then raise exception 'Renewal payment missing'; end if;
  update public.membership_periods set expires_on=v_active_expiry where id=v_active_period;

  -- Active complimentary entitlement cannot use paid Renew.
  begin
    perform * from public.admin_renew_active_membership(v_comp_member,v_comp_period,v_active_expiry,12,'months',500,'USDT',v_today,null,null,'Should reject','phase2-test');
    raise exception 'Expected ACTION_NOT_ALLOWED';
  exception when others then
    if sqlerrm <> 'ACTION_NOT_ALLOWED' then raise; end if;
  end;

  -- Former-member reactivation creates a new period without changing old history.
  select * into v_result from public.admin_reactivate_membership(
    v_former_member,v_former_period,v_former_expiry,v_today,12,'months',500,'USDT',v_today,'phase2-test-reactivate',null,'Returning member','phase2-test');
  if v_result.old_expiry <> v_former_expiry then raise exception 'Previous expiry lost'; end if;
  if not exists(select 1 from public.membership_periods where id=v_result.membership_period_id and starts_on=v_today and source='phase2_admin_reactivation') then raise exception 'New reactivation period missing'; end if;
  if (select expires_on from public.membership_periods where id=v_former_period) <> v_former_expiry then raise exception 'Historical period was modified'; end if;
end $$;

rollback;

-- Security assertions are read-only and remain outside the rolled-back synthetic data.
do $$
begin
  if not has_function_privilege('service_role','public.admin_change_membership_expiry(uuid,uuid,date,date,text,boolean,text)','EXECUTE') then raise exception 'service_role missing Change Expiry privilege'; end if;
  if has_function_privilege('anon','public.admin_change_membership_expiry(uuid,uuid,date,date,text,boolean,text)','EXECUTE') then raise exception 'anon can Change Expiry'; end if;
  if has_function_privilege('authenticated','public.admin_change_membership_expiry(uuid,uuid,date,date,text,boolean,text)','EXECUTE') then raise exception 'authenticated can Change Expiry'; end if;
  if not has_function_privilege('service_role','public.admin_add_membership_time(uuid,uuid,date,integer,text,text,text)','EXECUTE') then raise exception 'service_role missing Add Time privilege'; end if;
  if has_function_privilege('anon','public.admin_add_membership_time(uuid,uuid,date,integer,text,text,text)','EXECUTE') then raise exception 'anon can Add Time'; end if;
  if not has_function_privilege('service_role','public.admin_renew_active_membership(uuid,uuid,date,integer,text,numeric,text,date,text,text,text,text)','EXECUTE') then raise exception 'service_role missing Renew privilege'; end if;
  if has_function_privilege('authenticated','public.admin_renew_active_membership(uuid,uuid,date,integer,text,numeric,text,date,text,text,text,text)','EXECUTE') then raise exception 'authenticated can Renew'; end if;
  if not has_function_privilege('service_role','public.admin_reactivate_membership(uuid,uuid,date,date,integer,text,numeric,text,date,text,text,text,text)','EXECUTE') then raise exception 'service_role missing Reactivate privilege'; end if;
  if has_function_privilege('anon','public.admin_reactivate_membership(uuid,uuid,date,date,integer,text,numeric,text,date,text,text,text,text)','EXECUTE') then raise exception 'anon can Reactivate'; end if;
end $$;
