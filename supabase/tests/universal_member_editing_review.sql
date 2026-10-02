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
