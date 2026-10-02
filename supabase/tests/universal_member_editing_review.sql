-- Rollback-only regression suite for Universal Member Editing & Review Resolution.
-- Safe to run repeatedly after the migration is installed: synthetic writes are rolled back.

begin;

do $$
declare
  v_member uuid;
  v_period_one uuid;
  v_period_two uuid;
  v_payment uuid;
  v_case_one uuid;
  v_case_two uuid;
  v_reopened uuid;
  v_count integer;
begin
  if to_regclass('public.member_review_cases') is null then
    raise exception 'Missing member_review_cases table';
  end if;
  if to_regclass('public.admin_member_review_summary') is null then
    raise exception 'Missing admin_member_review_summary view';
  end if;
  if to_regprocedure('public.admin_open_member_review_case(uuid,uuid,uuid,text,text,text)') is null then
    raise exception 'Missing admin_open_member_review_case RPC';
  end if;
  if to_regprocedure('public.admin_resolve_member_review_case(uuid,uuid,text,text,text)') is null then
    raise exception 'Missing admin_resolve_member_review_case RPC';
  end if;

  insert into public.members(display_name, email, source_system, marketing_status)
  values ('Universal Review SQL Test', 'universal-review-test@example.com', 'admin_manual', 'unknown')
  returning id into v_member;

  insert into public.membership_periods(
    member_id, entitlement_type, source, starts_on, expires_on, expiry_mode, migration_review
  ) values (
    v_member, 'paid', 'test', null, '2024-01-01', 'fixed', true
  ) returning id into v_period_one;

  insert into public.membership_periods(
    member_id, entitlement_type, source, starts_on, expires_on, expiry_mode, migration_review
  ) values (
    v_member, 'paid', 'test', null, '2025-01-01', 'fixed', true
  ) returning id into v_period_two;

  insert into public.payments(
    member_id, membership_period_id, amount, currency, status, verification_method
  ) values (
    v_member, v_period_one, 100, 'USDT', 'verified', 'manual'
  ) returning id into v_payment;

  select review_case_id into v_case_one
  from public.admin_open_member_review_case(
    v_member, null, v_payment, 'payment', 'Payment details need confirmation', 'sql-test'
  );

  if not exists (
    select 1 from public.member_review_cases rc
    where rc.id=v_case_one and rc.member_id=v_member and rc.payment_id=v_payment
      and rc.origin='manual' and rc.category='payment' and rc.status='OPEN'
      and rc.opening_reason='Payment details need confirmation'
      and rc.opened_by='sql-test'
  ) then raise exception 'Review open row invalid'; end if;

  if not exists (
    select 1 from public.membership_events e
    where e.member_id=v_member and e.event_type='REVIEW_OPENED'
      and e.actor_type='admin' and e.actor_id='sql-test'
      and e.metadata->>'review_case_id'=v_case_one::text
      and e.metadata->>'payment_id'=v_payment::text
  ) then raise exception 'Review open event missing'; end if;

  if not exists (
    select 1 from public.audit_log a
    where a.action='REVIEW_OPENED' and a.entity_type='member_review_case'
      and a.entity_id=v_case_one::text and a.actor_id='sql-test'
  ) then raise exception 'Review open audit missing'; end if;

  begin
    perform * from public.admin_open_member_review_case(
      v_member, null, v_payment, 'payment', 'Duplicate open issue', 'sql-test'
    );
    raise exception 'Expected DUPLICATE_REVIEW_CASE';
  exception when others then
    if sqlerrm <> 'DUPLICATE_REVIEW_CASE' then raise; end if;
  end;

  perform * from public.admin_resolve_member_review_case(
    v_case_one, v_member, 'HISTORICAL_DETAIL_UNKNOWN_ACCEPTED',
    'Payment date cannot be established reliably', 'sql-test'
  );

  if not exists (
    select 1 from public.member_review_cases rc
    where rc.id=v_case_one and rc.status='RESOLVED'
      and rc.resolution_outcome='HISTORICAL_DETAIL_UNKNOWN_ACCEPTED'
      and rc.resolution_note='Payment date cannot be established reliably'
      and rc.resolved_by='sql-test' and rc.resolved_at is not null
  ) then raise exception 'Review resolution row invalid'; end if;

  if not exists (
    select 1 from public.payments p
    where p.id=v_payment and p.received_at is null and p.amount=100 and p.currency='USDT'
  ) then raise exception 'Historical unknown resolution changed payment facts'; end if;

  if not exists (
    select 1 from public.membership_events e
    where e.member_id=v_member and e.event_type='REVIEW_RESOLVED'
      and e.metadata->>'review_case_id'=v_case_one::text
      and e.metadata->>'resolution_outcome'='HISTORICAL_DETAIL_UNKNOWN_ACCEPTED'
  ) then raise exception 'Review resolution event missing'; end if;

  select review_case_id into v_reopened
  from public.admin_open_member_review_case(
    v_member, null, v_payment, 'payment', 'A later discrepancy was found', 'sql-test'
  );
  if v_reopened = v_case_one then raise exception 'Reopen overwrote resolved Review case'; end if;

  -- A Review case can target at most one linked entity.
  begin
    insert into public.member_review_cases(
      member_id, membership_period_id, payment_id, origin, category,
      opening_reason, status, opened_by
    ) values (
      v_member, v_period_one, v_payment, 'manual', 'other',
      'Invalid dual link', 'OPEN', 'sql-test'
    );
    raise exception 'Expected linked-entity constraint failure';
  exception when check_violation then null;
  end;

  -- Linked entities must belong to the supplied member.
  begin
    perform * from public.admin_open_member_review_case(
      gen_random_uuid(), v_period_one, null, 'membership', 'Wrong member', 'sql-test'
    );
    raise exception 'Expected INVALID_INPUT for wrong member/link ownership';
  exception when others then
    if sqlerrm <> 'INVALID_INPUT' then raise; end if;
  end;

  -- Resolution state cannot be persisted half-complete.
  begin
    insert into public.member_review_cases(
      member_id, origin, category, opening_reason, status, opened_by,
      resolution_outcome
    ) values (
      v_member, 'manual', 'other', 'Invalid state', 'OPEN', 'sql-test',
      'EXISTING_DATA_CONFIRMED'
    );
    raise exception 'Expected Review state constraint failure';
  exception when check_violation then null;
  end;

  insert into public.member_review_cases(
    member_id, membership_period_id, origin, category, opening_reason, status, opened_by
  ) values (
    v_member, v_period_one, 'legacy_migration', 'historical',
    'Historical membership start date unavailable from migrated source.', 'OPEN', 'sql-test-seed'
  ) returning id into v_case_one;

  insert into public.member_review_cases(
    member_id, membership_period_id, origin, category, opening_reason, status, opened_by
  ) values (
    v_member, v_period_two, 'legacy_migration', 'historical',
    'Historical membership start date unavailable from migrated source.', 'OPEN', 'sql-test-seed'
  ) returning id into v_case_two;

  perform * from public.admin_resolve_member_review_case(
    v_case_one, v_member, 'HISTORICAL_DETAIL_UNKNOWN_ACCEPTED',
    'Start date remains unknown after review', 'sql-test'
  );

  if (select migration_review from public.membership_periods where id=v_period_one) is not false then
    raise exception 'Resolved legacy case did not clear its linked flag';
  end if;
  if (select migration_review from public.membership_periods where id=v_period_two) is not true then
    raise exception 'Resolving one legacy case cleared another period flag';
  end if;
  if not exists(select 1 from public.member_review_cases where id=v_case_two and status='OPEN') then
    raise exception 'Resolving one case altered another open case';
  end if;

  select count(*) into v_count
  from public.admin_member_review_summary
  where member_id=v_member;
  if v_count <> 1 then raise exception 'Review summary did not deduplicate member'; end if;

  if not exists (
    select 1 from public.admin_member_review_summary s
    where s.member_id=v_member and s.open_review_count=2
      and 'historical'=any(s.review_categories)
      and 'payment'=any(s.review_categories)
  ) then raise exception 'Review summary open-case aggregation is invalid'; end if;

  if not exists (
    select 1 from public.membership_periods
    where id=v_period_one and starts_on is null
  ) then raise exception 'Historical unknown resolution invented a membership start'; end if;
end $$;

rollback;

do $$
begin
  if not has_function_privilege(
    'service_role',
    'public.admin_open_member_review_case(uuid,uuid,uuid,text,text,text)', 'EXECUTE'
  ) then raise exception 'service_role cannot open Review cases'; end if;
  if not has_function_privilege(
    'service_role',
    'public.admin_resolve_member_review_case(uuid,uuid,text,text,text)', 'EXECUTE'
  ) then raise exception 'service_role cannot resolve Review cases'; end if;

  if has_function_privilege(
    'anon', 'public.admin_open_member_review_case(uuid,uuid,uuid,text,text,text)', 'EXECUTE'
  ) or has_function_privilege(
    'authenticated', 'public.admin_open_member_review_case(uuid,uuid,uuid,text,text,text)', 'EXECUTE'
  ) then raise exception 'Browser roles can open Review cases'; end if;

  if has_function_privilege(
    'anon', 'public.admin_resolve_member_review_case(uuid,uuid,text,text,text)', 'EXECUTE'
  ) or has_function_privilege(
    'authenticated', 'public.admin_resolve_member_review_case(uuid,uuid,text,text,text)', 'EXECUTE'
  ) then raise exception 'Browser roles can resolve Review cases'; end if;

  if not has_table_privilege('service_role', 'public.member_review_cases', 'SELECT')
     or not has_table_privilege('service_role', 'public.admin_member_review_summary', 'SELECT') then
    raise exception 'service_role missing Review SELECT privileges';
  end if;
  if has_table_privilege('anon', 'public.member_review_cases', 'SELECT')
     or has_table_privilege('authenticated', 'public.member_review_cases', 'SELECT')
     or has_table_privilege('anon', 'public.admin_member_review_summary', 'SELECT')
     or has_table_privilege('authenticated', 'public.admin_member_review_summary', 'SELECT') then
    raise exception 'Browser roles can read Review admin data';
  end if;
  if has_table_privilege('service_role', 'public.member_review_cases', 'INSERT')
     or has_table_privilege('service_role', 'public.member_review_cases', 'UPDATE')
     or has_table_privilege('service_role', 'public.member_review_cases', 'DELETE') then
    raise exception 'service_role can bypass Review RPCs with direct table writes';
  end if;

  if exists (
    select 1
    from public.member_review_cases rc
    where rc.origin='legacy_migration'
      and rc.opened_by='system/review-case-migration-2026-10-01'
      and not exists (
        select 1 from public.membership_events e
        where e.event_type='REVIEW_OPENED'
          and e.member_id=rc.member_id
          and e.membership_period_id is not distinct from rc.membership_period_id
          and e.metadata->>'review_case_id'=rc.id::text
          and e.metadata->>'origin'='legacy_migration'
      )
  ) then raise exception 'Seeded Review case missing REVIEW_OPENED event provenance'; end if;

  if exists (
    select 1
    from public.member_review_cases rc
    where rc.origin='legacy_migration'
      and rc.opened_by='system/review-case-migration-2026-10-01'
      and not exists (
        select 1 from public.audit_log a
        where a.action='REVIEW_OPENED'
          and a.entity_type='member_review_case'
          and a.entity_id=rc.id::text
          and a.actor_id='system/review-case-migration-2026-10-01'
      )
  ) then raise exception 'Seeded Review case missing audit provenance'; end if;
end $$;


begin;

do $$
declare
  v_member uuid;
  v_other uuid;
  v_stub_member uuid;
  v_account uuid;
  v_audit_before integer;
  v_protected_before jsonb;
  v_protected_after jsonb;
  v_expected jsonb;
  v_proposed jsonb;
begin
  if to_regprocedure('public.admin_update_member_details(uuid,jsonb,jsonb,text,text)') is null then
    raise exception 'Missing admin_update_member_details RPC';
  end if;
  if to_regprocedure('public.admin_update_telegram_username(uuid,uuid,text,text,text,text)') is null then
    raise exception 'Missing admin_update_telegram_username RPC';
  end if;

  insert into public.members(display_name,email,first_joined_on,admin_notes,marketing_status,source_system)
  values ('Editing SQL Test','editing-old@example.com','2024-01-01','Original note','unknown','admin_manual')
  returning id into v_member;
  insert into public.members(display_name,email,marketing_status,source_system)
  values ('Editing Duplicate','taken@example.com','unknown','admin_manual') returning id into v_other;
  insert into public.members(display_name,marketing_status,source_system)
  values ('Telegram Stub Test','unknown','admin_manual') returning id into v_stub_member;

  v_expected := jsonb_build_object(
    'display_name','Editing SQL Test','email','editing-old@example.com',
    'first_joined_on','2024-01-01','admin_notes','Original note','marketing_status','unknown'
  );
  v_proposed := jsonb_build_object(
    'display_name','  Editing   SQL Updated  ','email',' EDITING-NEW@EXAMPLE.COM ',
    'first_joined_on','2024-01-01','admin_notes','Original note','marketing_status','unknown'
  );
  perform * from public.admin_update_member_details(v_member,v_expected,v_proposed,null,'sql-test');

  if not exists (
    select 1 from public.members m where m.id=v_member
      and m.display_name='Editing SQL Updated' and m.email='editing-new@example.com'
      and m.first_joined_on='2024-01-01'
  ) then raise exception 'Member details were not normalized/saved'; end if;

  if not exists (
    select 1 from public.audit_log a
    where a.action='MEMBER_DETAILS_UPDATED' and a.entity_type='member'
      and a.entity_id=v_member::text
      and a.before_data=jsonb_build_object('display_name','Editing SQL Test','email','editing-old@example.com')
      and a.after_data=jsonb_build_object('display_name','Editing SQL Updated','email','editing-new@example.com')
  ) then raise exception 'Member details changed-only audit invalid'; end if;

  select count(*) into v_audit_before from public.audit_log
  where action='MEMBER_DETAILS_UPDATED' and entity_id=v_member::text;

  begin
    perform * from public.admin_update_member_details(
      v_member, v_expected,
      jsonb_set(v_expected,'{display_name}',to_jsonb('Stale Change'::text)),
      null,'sql-test'
    );
    raise exception 'Expected STALE_PREVIEW';
  exception when others then
    if sqlerrm <> 'STALE_PREVIEW' then raise; end if;
  end;
  if (select count(*) from public.audit_log where action='MEMBER_DETAILS_UPDATED' and entity_id=v_member::text) <> v_audit_before then
    raise exception 'Stale member edit wrote an audit row';
  end if;

  v_expected := jsonb_build_object(
    'display_name','Editing SQL Updated','email','editing-new@example.com',
    'first_joined_on','2024-01-01','admin_notes','Original note','marketing_status','unknown'
  );
  v_proposed := jsonb_set(v_expected,'{first_joined_on}',to_jsonb('2024-01-02'::text));
  begin
    perform * from public.admin_update_member_details(v_member,v_expected,v_proposed,null,'sql-test');
    raise exception 'Expected INVALID_INPUT for structural change without reason';
  exception when others then
    if sqlerrm <> 'INVALID_INPUT' then raise; end if;
  end;
  perform * from public.admin_update_member_details(v_member,v_expected,v_proposed,'Correct legacy join date','sql-test');

  v_expected := jsonb_build_object(
    'display_name','Editing SQL Updated','email','editing-new@example.com',
    'first_joined_on','2024-01-02','admin_notes','Original note','marketing_status','unknown'
  );
  v_proposed := jsonb_set(v_expected,'{email}',to_jsonb(' TAKEN@EXAMPLE.COM '::text));
  begin
    perform * from public.admin_update_member_details(v_member,v_expected,v_proposed,null,'sql-test');
    raise exception 'Expected DUPLICATE_EMAIL';
  exception when others then
    if sqlerrm <> 'DUPLICATE_EMAIL' then raise; end if;
  end;
  if (select email from public.members where id=v_member) <> 'editing-new@example.com' then
    raise exception 'Duplicate email attempt changed member';
  end if;

  begin
    perform * from public.admin_update_member_details(
      v_member,
      v_expected || jsonb_build_object('legacy_member_code','CM-X'),
      v_expected,
      null,'sql-test'
    );
    raise exception 'Expected INVALID_INPUT for unknown member JSON key';
  exception when others then
    if sqlerrm <> 'INVALID_INPUT' then raise; end if;
  end;

  insert into public.telegram_accounts(
    member_id,telegram_user_id,telegram_username,telegram_raw,bot_started_at,linked_at,dm_available,last_verified_at
  ) values (
    v_member,111111,'old_name','@Old_Name','2026-01-01 10:00+00','2026-01-02 10:00+00',true,'2026-01-03 10:00+00'
  ) returning id into v_account;

  insert into public.telegram_accounts(member_id,telegram_username,dm_available)
  values (v_other,'taken_name',false);

  select to_jsonb(ta)-'telegram_username' into v_protected_before
  from public.telegram_accounts ta where ta.id=v_account;

  perform * from public.admin_update_telegram_username(
    v_member,v_account,'old_name',' @New_Name ',null,'sql-test'
  );

  if (select telegram_username from public.telegram_accounts where id=v_account) <> 'new_name' then
    raise exception 'Telegram username was not normalized/saved';
  end if;
  select to_jsonb(ta)-'telegram_username' into v_protected_after
  from public.telegram_accounts ta where ta.id=v_account;
  if v_protected_after is distinct from v_protected_before then
    raise exception 'Telegram username edit changed protected identity/link fields';
  end if;

  if not exists (
    select 1 from public.audit_log a
    where a.action='TELEGRAM_USERNAME_UPDATED' and a.entity_type='telegram_account'
      and a.entity_id=v_account::text
      and a.before_data=jsonb_build_object('telegram_username','old_name')
      and a.after_data=jsonb_build_object('telegram_username','new_name')
  ) then raise exception 'Telegram username audit invalid'; end if;

  begin
    perform * from public.admin_update_telegram_username(
      v_member,v_account,'new_name','@TAKEN_NAME',null,'sql-test'
    );
    raise exception 'Expected DUPLICATE_TELEGRAM';
  exception when others then
    if sqlerrm <> 'DUPLICATE_TELEGRAM' then raise; end if;
  end;

  begin
    perform * from public.admin_update_telegram_username(
      v_member,v_account,'old_name','another_name',null,'sql-test'
    );
    raise exception 'Expected STALE_PREVIEW for Telegram username';
  exception when others then
    if sqlerrm <> 'STALE_PREVIEW' then raise; end if;
  end;

  select telegram_account_id into v_account
  from public.admin_update_telegram_username(
    v_stub_member,null,null,'@stub_name',null,'sql-test'
  );
  if not exists (
    select 1 from public.telegram_accounts ta
    where ta.id=v_account and ta.member_id=v_stub_member and ta.telegram_username='stub_name'
      and ta.telegram_user_id is null and ta.bot_started_at is null and ta.linked_at is null
      and ta.dm_available=false and ta.last_verified_at is null
  ) then raise exception 'Unlinked Telegram username stub is invalid'; end if;

  begin
    perform * from public.admin_update_telegram_username(
      v_stub_member,null,null,'second_stub',null,'sql-test'
    );
    raise exception 'Expected STALE_PREVIEW when stub appeared after Preview';
  exception when others then
    if sqlerrm <> 'STALE_PREVIEW' then raise; end if;
  end;
end $$;

rollback;

do $$
begin
  if not has_function_privilege(
    'service_role','public.admin_update_member_details(uuid,jsonb,jsonb,text,text)','EXECUTE'
  ) then raise exception 'service_role cannot update member details'; end if;
  if not has_function_privilege(
    'service_role','public.admin_update_telegram_username(uuid,uuid,text,text,text,text)','EXECUTE'
  ) then raise exception 'service_role cannot update Telegram username'; end if;
  if has_function_privilege(
    'anon','public.admin_update_member_details(uuid,jsonb,jsonb,text,text)','EXECUTE'
  ) or has_function_privilege(
    'authenticated','public.admin_update_member_details(uuid,jsonb,jsonb,text,text)','EXECUTE'
  ) then raise exception 'Browser roles can update member details'; end if;
  if has_function_privilege(
    'anon','public.admin_update_telegram_username(uuid,uuid,text,text,text,text)','EXECUTE'
  ) or has_function_privilege(
    'authenticated','public.admin_update_telegram_username(uuid,uuid,text,text,text,text)','EXECUTE'
  ) then raise exception 'Browser roles can update Telegram username'; end if;
end $$;


begin;

do $$
declare
  v_member uuid;
  v_period_one uuid;
  v_period_two uuid;
  v_period_unknown uuid;
  v_payment_one uuid;
  v_payment_two uuid;
  v_expected jsonb;
  v_proposed jsonb;
  v_period_snapshot jsonb;
  v_verification_before jsonb;
  v_verification_after jsonb;
  v_switches_before jsonb;
  v_switches_after jsonb;
begin
  if to_regprocedure('public.admin_correct_membership_period(uuid,uuid,jsonb,jsonb,text,text)') is null then
    raise exception 'Missing admin_correct_membership_period RPC';
  end if;
  if to_regprocedure('public.admin_correct_payment(uuid,uuid,jsonb,jsonb,text,text)') is null then
    raise exception 'Missing admin_correct_payment RPC';
  end if;

  select jsonb_object_agg(setting_key,setting_value order by setting_key) into v_switches_before
  from public.system_settings where setting_key in (
    'automatic_reminders_enabled','automatic_removals_enabled',
    'campaign_sending_enabled','payment_auto_activation_enabled'
  );

  insert into public.members(display_name,marketing_status,source_system)
  values ('Period Payment SQL Test','unknown','admin_manual') returning id into v_member;

  insert into public.membership_periods(
    member_id,entitlement_type,plan_name,source,starts_on,expires_on,expiry_mode,
    removal_protected,protection_reason,ended_early_on,legacy_notes,admin_note
  ) values (
    v_member,'paid','Plan A','test-source','2026-01-01','2026-03-01','fixed',
    false,null,null,'ORIGINAL LEGACY EVIDENCE','Old note'
  ) returning id into v_period_one;

  insert into public.membership_periods(
    member_id,entitlement_type,plan_name,source,starts_on,expires_on,expiry_mode
  ) values (
    v_member,'paid','Plan B','test-source','2026-04-01','2026-06-01','fixed'
  ) returning id into v_period_two;

  insert into public.membership_periods(
    member_id,entitlement_type,plan_name,source,starts_on,expires_on,expiry_mode,admin_note
  ) values (
    v_member,'paid','Legacy unknown','test-source',null,'2020-01-01','fixed','Unknown start'
  ) returning id into v_period_unknown;

  insert into public.payments(
    member_id,membership_period_id,amount,currency,network,tx_hash,status,
    verification_method,received_at,verified_at,verified_by,notes
  ) values (
    v_member,v_period_one,100,'USDT','ERC20','tx-original','verified',
    'manual',null,'2026-01-05 12:00+00','original-admin','Original payment'
  ) returning id into v_payment_one;

  insert into public.payments(
    member_id,membership_period_id,amount,currency,tx_hash,status,verification_method
  ) values (
    v_member,v_period_two,50,'USDT','tx-existing','verified','manual'
  ) returning id into v_payment_two;

  v_expected := jsonb_build_object(
    'entitlement_type','paid','plan_name','Plan A','starts_on','2026-01-01',
    'expires_on','2026-03-01','expiry_mode','fixed','removal_protected',false,
    'protection_reason',null,'ended_early_on',null,'admin_note','Old note'
  );
  v_proposed := jsonb_build_object(
    'entitlement_type','paid','plan_name','Plan A corrected','starts_on','2026-01-02',
    'expires_on','2026-03-01','expiry_mode','fixed','removal_protected',false,
    'protection_reason',null,'ended_early_on',null,'admin_note','Corrected note'
  );
  perform * from public.admin_correct_membership_period(
    v_member,v_period_one,v_expected,v_proposed,'Correct legacy period details','sql-test'
  );

  if not exists (
    select 1 from public.membership_periods mp where mp.id=v_period_one
      and mp.plan_name='Plan A corrected' and mp.starts_on='2026-01-02'
      and mp.admin_note='Corrected note' and mp.source='test-source'
      and mp.legacy_notes='ORIGINAL LEGACY EVIDENCE'
  ) then raise exception 'Period correction changed wrong fields/evidence'; end if;

  if not exists (
    select 1 from public.audit_log a
    where a.action='MEMBERSHIP_PERIOD_CORRECTED' and a.entity_id=v_period_one::text
      and a.before_data ? 'plan_name' and a.before_data ? 'starts_on' and a.before_data ? 'admin_note'
      and not (a.before_data ? 'source') and not (a.before_data ? 'legacy_notes')
  ) then raise exception 'Period changed-only audit invalid'; end if;

  begin
    perform * from public.admin_correct_membership_period(
      v_member,v_period_one,v_expected,v_proposed,'Stale retry','sql-test'
    );
    raise exception 'Expected STALE_PREVIEW for period';
  exception when others then
    if sqlerrm <> 'STALE_PREVIEW' then raise; end if;
  end;

  v_expected := jsonb_build_object(
    'entitlement_type','paid','plan_name','Plan A corrected','starts_on','2026-01-02',
    'expires_on','2026-03-01','expiry_mode','fixed','removal_protected',false,
    'protection_reason',null,'ended_early_on',null,'admin_note','Corrected note'
  );
  v_proposed := jsonb_set(v_expected,'{expires_on}',to_jsonb('2026-04-01'::text));
  begin
    perform * from public.admin_correct_membership_period(
      v_member,v_period_one,v_expected,v_proposed,'Would overlap next period','sql-test'
    );
    raise exception 'Expected OVERLAPPING_ENTITLEMENT';
  exception when others then
    if sqlerrm <> 'OVERLAPPING_ENTITLEMENT' then raise; end if;
  end;

  v_expected := jsonb_build_object(
    'entitlement_type','paid','plan_name','Legacy unknown','starts_on',null,
    'expires_on','2020-01-01','expiry_mode','fixed','removal_protected',false,
    'protection_reason',null,'ended_early_on',null,'admin_note','Unknown start'
  );
  v_proposed := jsonb_set(v_expected,'{admin_note}',to_jsonb('Reviewed; start still unknown'::text));
  perform * from public.admin_correct_membership_period(
    v_member,v_period_unknown,v_expected,v_proposed,'Document review without inventing start','sql-test'
  );
  if not exists (
    select 1 from public.membership_periods mp where mp.id=v_period_unknown
      and mp.starts_on is null and mp.admin_note='Reviewed; start still unknown'
  ) then raise exception 'Unknown historical date was not preserved'; end if;

  v_expected := jsonb_build_object(
    'amount',100,'currency','USDT','network','ERC20','tx_hash','tx-original',
    'status','verified','received_at',null,'notes','Original payment'
  );
  v_proposed := jsonb_build_object(
    'amount',150,'currency','USDT','network','ERC20','tx_hash','tx-corrected',
    'status','verified','received_at',null,'notes','Corrected payment amount'
  );
  select to_jsonb(mp) into v_period_snapshot from public.membership_periods mp where mp.id=v_period_one;
  select jsonb_build_object(
    'verification_method',p.verification_method,'verified_at',p.verified_at,'verified_by',p.verified_by
  ) into v_verification_before from public.payments p where p.id=v_payment_one;

  perform * from public.admin_correct_payment(
    v_member,v_payment_one,v_expected,v_proposed,'Correct payment record','sql-test'
  );
  if not exists (
    select 1 from public.payments p where p.id=v_payment_one
      and p.amount=150 and p.tx_hash='tx-corrected' and p.received_at is null
      and p.notes='Corrected payment amount'
  ) then raise exception 'Payment correction invalid'; end if;

  select jsonb_build_object(
    'verification_method',p.verification_method,'verified_at',p.verified_at,'verified_by',p.verified_by
  ) into v_verification_after from public.payments p where p.id=v_payment_one;
  if v_verification_after is distinct from v_verification_before then
    raise exception 'Payment correction changed verification provenance';
  end if;
  if (select to_jsonb(mp) from public.membership_periods mp where mp.id=v_period_one)
       is distinct from v_period_snapshot then
    raise exception 'Payment correction changed membership entitlement';
  end if;

  if not exists (
    select 1 from public.audit_log a where a.action='PAYMENT_CORRECTED'
      and a.entity_id=v_payment_one::text and a.before_data ? 'amount'
      and a.before_data ? 'tx_hash' and a.before_data ? 'notes'
      and not (a.before_data ? 'verification_method')
  ) then raise exception 'Payment changed-only audit invalid'; end if;

  begin
    perform * from public.admin_correct_payment(
      v_member,v_payment_one,v_expected,v_proposed,'Stale payment retry','sql-test'
    );
    raise exception 'Expected STALE_PREVIEW for payment';
  exception when others then
    if sqlerrm <> 'STALE_PREVIEW' then raise; end if;
  end;

  v_expected := jsonb_build_object(
    'amount',150,'currency','USDT','network','ERC20','tx_hash','tx-corrected',
    'status','verified','received_at',null,'notes','Corrected payment amount'
  );
  v_proposed := jsonb_set(v_expected,'{tx_hash}',to_jsonb('tx-existing'::text));
  begin
    perform * from public.admin_correct_payment(
      v_member,v_payment_one,v_expected,v_proposed,'Test duplicate tx','sql-test'
    );
    raise exception 'Expected DUPLICATE_TX_HASH';
  exception when others then
    if sqlerrm <> 'DUPLICATE_TX_HASH' then raise; end if;
  end;

  select jsonb_object_agg(setting_key,setting_value order by setting_key) into v_switches_after
  from public.system_settings where setting_key in (
    'automatic_reminders_enabled','automatic_removals_enabled',
    'campaign_sending_enabled','payment_auto_activation_enabled'
  );
  if v_switches_after is distinct from v_switches_before then
    raise exception 'Editing RPCs changed automation safety switches';
  end if;
end $$;

rollback;

do $$
begin
  if not has_function_privilege(
    'service_role','public.admin_correct_membership_period(uuid,uuid,jsonb,jsonb,text,text)','EXECUTE'
  ) then raise exception 'service_role cannot correct membership periods'; end if;
  if not has_function_privilege(
    'service_role','public.admin_correct_payment(uuid,uuid,jsonb,jsonb,text,text)','EXECUTE'
  ) then raise exception 'service_role cannot correct payments'; end if;
  if has_function_privilege(
    'anon','public.admin_correct_membership_period(uuid,uuid,jsonb,jsonb,text,text)','EXECUTE'
  ) or has_function_privilege(
    'authenticated','public.admin_correct_membership_period(uuid,uuid,jsonb,jsonb,text,text)','EXECUTE'
  ) then raise exception 'Browser roles can correct membership periods'; end if;
  if has_function_privilege(
    'anon','public.admin_correct_payment(uuid,uuid,jsonb,jsonb,text,text)','EXECUTE'
  ) or has_function_privilege(
    'authenticated','public.admin_correct_payment(uuid,uuid,jsonb,jsonb,text,text)','EXECUTE'
  ) then raise exception 'Browser roles can correct payments'; end if;
end $$;
