-- Rollback-only regression suite for CryptoMainly Add Member.
-- Safe to run repeatedly: all synthetic writes are rolled back.

begin;

do $$
declare
  v_paid record;
  v_comp record;
  v_trial record;
  v_settings_before jsonb;
  v_settings_after jsonb;
  v_tx_hash text := 'add-member-test-' || gen_random_uuid()::text;
  v_count integer;
begin
  if to_regprocedure('public.admin_create_member(text,text,text,text,date,integer,text,date,text,text,numeric,text,date,text,text,text)') is null then
    raise exception 'Missing admin_create_member RPC';
  end if;

  select jsonb_object_agg(setting_key, setting_value order by setting_key)
  into v_settings_before
  from public.system_settings
  where setting_key in (
    'automatic_reminders_enabled',
    'automatic_removals_enabled',
    'campaign_sending_enabled',
    'payment_auto_activation_enabled'
  );

  select * into v_paid from public.admin_create_member(
    'Add Member Test Paid', ' PAID.TEST@EXAMPLE.COM ', ' @Add_Member_Paid ', 'paid',
    '2027-01-31', 1, 'months', '2027-02-28', null,
    'Initial paid membership', 100, 'usdt', null, v_tx_hash, 'Manual test payment', 'add-member-test'
  );

  if not exists (
    select 1 from public.members m
    where m.id = v_paid.member_id
      and m.display_name = 'Add Member Test Paid'
      and m.email = 'paid.test@example.com'
      and m.first_joined_on = '2027-01-31'
      and m.source_system = 'admin_manual'
      and m.marketing_status = 'unknown'
  ) then raise exception 'Paid member row invalid'; end if;

  if not exists (
    select 1 from public.membership_periods mp
    where mp.id = v_paid.membership_period_id
      and mp.member_id = v_paid.member_id
      and mp.entitlement_type = 'paid'
      and mp.source = 'phase2_admin_create'
      and mp.starts_on = '2027-01-31'
      and mp.expires_on = '2027-02-28'
      and mp.expiry_mode = 'fixed'
      and mp.admin_note = 'Initial paid membership'
  ) then raise exception 'Paid membership period invalid'; end if;

  if not exists (
    select 1 from public.payments p
    where p.id = v_paid.payment_id
      and p.member_id = v_paid.member_id
      and p.membership_period_id = v_paid.membership_period_id
      and p.amount = 100
      and p.currency = 'USDT'
      and p.tx_hash = v_tx_hash
      and p.status = 'verified'
      and p.verification_method = 'manual'
      and p.received_at is null
      and p.verified_by = 'add-member-test'
  ) then raise exception 'Paid payment invalid or blank payment date was invented'; end if;

  if not exists (
    select 1 from public.telegram_accounts ta
    where ta.id = v_paid.telegram_account_id
      and ta.member_id = v_paid.member_id
      and ta.telegram_username = 'add_member_paid'
      and ta.telegram_user_id is null
      and ta.bot_started_at is null
      and ta.linked_at is null
      and ta.dm_available is false
      and ta.last_verified_at is null
  ) then raise exception 'Telegram stub invalid'; end if;

  if not exists (
    select 1 from public.membership_events e
    where e.id = v_paid.event_id
      and e.member_id = v_paid.member_id
      and e.membership_period_id = v_paid.membership_period_id
      and e.event_type = 'MEMBER_CREATED'
      and e.new_expiry = '2027-02-28'
      and e.reason = 'Initial paid membership'
      and e.actor_type = 'admin'
      and e.actor_id = 'add-member-test'
      and e.metadata->>'calculated_expiry' = '2027-02-28'
      and e.metadata->>'final_expiry' = '2027-02-28'
      and e.metadata->>'expiry_overridden' = 'false'
      and e.metadata->>'payment_id' = v_paid.payment_id::text
  ) then raise exception 'Creation event invalid'; end if;

  if not exists (
    select 1 from public.audit_log a
    where a.action = 'MEMBER_CREATED'
      and a.entity_type = 'member'
      and a.entity_id = v_paid.member_id::text
      and a.actor_type = 'admin'
      and a.actor_id = 'add-member-test'
      and a.reason = 'Initial paid membership'
      and a.after_data->>'membership_period_id' = v_paid.membership_period_id::text
      and a.after_data->>'payment_id' = v_paid.payment_id::text
      and a.after_data->>'telegram_account_id' = v_paid.telegram_account_id::text
  ) then raise exception 'Creation audit invalid'; end if;

  select * into v_comp from public.admin_create_member(
    'Add Member Test Complimentary', null, null, 'complimentary',
    '2027-03-01', 1, 'months', '2027-04-01', null,
    'Goodwill membership', null, null, null, null, null, 'add-member-test'
  );
  if v_comp.payment_id is not null then raise exception 'Complimentary created a payment'; end if;
  if exists(select 1 from public.payments where member_id=v_comp.member_id) then raise exception 'Complimentary payment row exists'; end if;

  select * into v_trial from public.admin_create_member(
    'Add Member Test Trial', null, null, 'trial',
    '2027-03-01', 14, 'days', '2027-03-15', null,
    'Trial membership', null, null, null, null, null, 'add-member-test'
  );
  if v_trial.payment_id is not null then raise exception 'Trial created a payment'; end if;
  if exists(select 1 from public.payments where member_id=v_trial.member_id) then raise exception 'Trial payment row exists'; end if;

  -- Non-paid memberships reject payment payloads.
  begin
    perform * from public.admin_create_member(
      'Add Member Reject Payment', null, null, 'complimentary',
      '2027-03-01', 1, 'months', '2027-04-01', null,
      'Should reject', 1, 'USDT', null, null, null, 'add-member-test'
    );
    raise exception 'Expected INVALID_INPUT for complimentary payment data';
  exception when others then
    if sqlerrm <> 'INVALID_INPUT' then raise; end if;
  end;
  if exists(select 1 from public.members where display_name='Add Member Reject Payment') then raise exception 'Rejected non-paid member persisted'; end if;

  -- Manual expiry override requires a reason.
  begin
    perform * from public.admin_create_member(
      'Add Member Reject Override', null, null, 'trial',
      '2027-03-01', 14, 'days', '2027-03-20', null,
      'Should reject', null, null, null, null, null, 'add-member-test'
    );
    raise exception 'Expected INVALID_INPUT for missing override reason';
  exception when others then
    if sqlerrm <> 'INVALID_INPUT' then raise; end if;
  end;

  -- Exact normalized email duplicate hard-stops and rolls back the attempted member.
  begin
    perform * from public.admin_create_member(
      'Add Member Duplicate Email', 'PAID.TEST@example.com', null, 'trial',
      '2027-04-01', 14, 'days', '2027-04-15', null,
      'Duplicate email test', null, null, null, null, null, 'add-member-test'
    );
    raise exception 'Expected DUPLICATE_EMAIL';
  exception when others then
    if sqlerrm <> 'DUPLICATE_EMAIL' then raise; end if;
  end;
  if exists(select 1 from public.members where display_name='Add Member Duplicate Email') then raise exception 'Duplicate-email member persisted'; end if;

  -- Exact normalized Telegram duplicate hard-stops, including @ and case differences.
  begin
    perform * from public.admin_create_member(
      'Add Member Duplicate Telegram', null, ' @ADD_MEMBER_PAID ', 'trial',
      '2027-04-01', 14, 'days', '2027-04-15', null,
      'Duplicate Telegram test', null, null, null, null, null, 'add-member-test'
    );
    raise exception 'Expected DUPLICATE_TELEGRAM';
  exception when others then
    if sqlerrm <> 'DUPLICATE_TELEGRAM' then raise; end if;
  end;
  if exists(select 1 from public.members where display_name='Add Member Duplicate Telegram') then raise exception 'Duplicate-Telegram member persisted'; end if;

  -- Existing transaction hash must not leave a partial member/period behind.
  begin
    perform * from public.admin_create_member(
      'Add Member Duplicate Tx', 'unique.tx@example.com', '@unique_tx_user', 'paid',
      '2027-04-01', 1, 'months', '2027-05-01', null,
      'Duplicate tx test', 25, 'USDT', null, v_tx_hash, null, 'add-member-test'
    );
    raise exception 'Expected DUPLICATE_TX_HASH';
  exception when others then
    if sqlerrm <> 'DUPLICATE_TX_HASH' then raise; end if;
  end;
  if exists(select 1 from public.members where display_name='Add Member Duplicate Tx') then raise exception 'Duplicate-tx member persisted'; end if;

  -- Final expiry must be after start date.
  begin
    perform * from public.admin_create_member(
      'Add Member Reject Expiry', null, null, 'trial',
      '2027-05-01', 14, 'days', '2027-05-01', 'Manual correction',
      'Should reject', null, null, null, null, null, 'add-member-test'
    );
    raise exception 'Expected INVALID_INPUT for non-positive entitlement window';
  exception when others then
    if sqlerrm <> 'INVALID_INPUT' then raise; end if;
  end;

  -- A valid override persists both calculated and final expiry plus the reason.
  select * into v_trial from public.admin_create_member(
    'Add Member Test Override', null, null, 'trial',
    '2027-06-01', 14, 'days', '2027-06-20', 'Promotional end date',
    'Trial with override', null, null, null, null, null, 'add-member-test'
  );
  if not exists (
    select 1 from public.membership_events e
    where e.id=v_trial.event_id
      and e.metadata->>'calculated_expiry'='2027-06-15'
      and e.metadata->>'final_expiry'='2027-06-20'
      and e.metadata->>'expiry_overridden'='true'
      and e.metadata->>'expiry_override_reason'='Promotional end date'
  ) then raise exception 'Override audit metadata invalid'; end if;

  select jsonb_object_agg(setting_key, setting_value order by setting_key)
  into v_settings_after
  from public.system_settings
  where setting_key in (
    'automatic_reminders_enabled',
    'automatic_removals_enabled',
    'campaign_sending_enabled',
    'payment_auto_activation_enabled'
  );
  if v_settings_after is distinct from v_settings_before then
    raise exception 'Add Member changed automation safety switches';
  end if;
end $$;

rollback;

do $$
begin
  if not has_function_privilege(
    'service_role',
    'public.admin_create_member(text,text,text,text,date,integer,text,date,text,text,numeric,text,date,text,text,text)',
    'EXECUTE'
  ) then raise exception 'service_role missing Add Member privilege'; end if;

  if has_function_privilege(
    'anon',
    'public.admin_create_member(text,text,text,text,date,integer,text,date,text,text,numeric,text,date,text,text,text)',
    'EXECUTE'
  ) then raise exception 'anon can Add Member'; end if;

  if has_function_privilege(
    'authenticated',
    'public.admin_create_member(text,text,text,text,date,integer,text,date,text,text,numeric,text,date,text,text,text)',
    'EXECUTE'
  ) then raise exception 'authenticated can Add Member'; end if;
end $$;
