-- Rollback-only regression suite for Phase 3A verified Telegram identity linking.
-- Safe to run repeatedly only after the Phase 3A migration is installed.

begin;

create temporary table phase3a_test_baseline as
select
  (select count(*) from public.telegram_group_access) as telegram_group_access_count,
  coalesce((
    select jsonb_object_agg(setting_key, setting_value order by setting_key)
    from public.system_settings
    where setting_key in (
      'automatic_reminders_enabled',
      'automatic_removals_enabled',
      'campaign_sending_enabled',
      'payment_auto_activation_enabled'
    )
  ), '{}'::jsonb) as automation_settings;

do $$
declare
  v_active uuid;
  v_former uuid;
  v_lifetime uuid;
  v_blocked uuid;
  v_restore uuid;
  v_raw uuid;
  v_ambiguous uuid;
  v_owner uuid;
  v_target uuid;
  v_protected_owner uuid;
  v_protected_target uuid;
  v_version bigint;
  v_token uuid;
  v_token2 uuid;
  v_expires timestamptz;
  v_revoked integer;
  v_result text;
  v_member uuid;
  v_account uuid;
  v_linked timestamptz;
  v_replayed boolean;
  v_event uuid;
  v_count integer;
  v_hash text;
begin
  if to_regclass('public.telegram_link_tokens') is null then
    raise exception 'Missing telegram_link_tokens table';
  end if;
  if to_regprocedure('public.admin_get_telegram_link_status(uuid)') is null then
    raise exception 'Missing admin_get_telegram_link_status RPC';
  end if;
  if to_regprocedure('public.admin_issue_telegram_link_token(uuid,bigint,text,text)') is null then
    raise exception 'Missing admin_issue_telegram_link_token RPC';
  end if;
  if to_regprocedure('public.telegram_consume_identity_link_v2(text,bigint,bigint,text)') is null then
    raise exception 'Missing telegram_consume_identity_link_v2 RPC';
  end if;

  insert into public.members(display_name,email,source_system,marketing_status)
  values ('phase3a_sql_test active','phase3a-active@example.com','admin_manual','unknown')
  returning id into v_active;
  insert into public.members(display_name,email,source_system,marketing_status)
  values ('phase3a_sql_test former','phase3a-former@example.com','admin_manual','unknown')
  returning id into v_former;
  insert into public.members(display_name,email,source_system,marketing_status)
  values ('phase3a_sql_test lifetime','phase3a-lifetime@example.com','admin_manual','unknown')
  returning id into v_lifetime;
  insert into public.members(display_name,email,source_system,marketing_status)
  values ('phase3a_sql_test blocked','phase3a-blocked@example.com','admin_manual','unknown')
  returning id into v_blocked;
  insert into public.members(display_name,email,source_system,marketing_status)
  values ('phase3a_sql_test restore','phase3a-restore@example.com','admin_manual','unknown')
  returning id into v_restore;
  insert into public.members(display_name,email,source_system,marketing_status)
  values ('phase3a_sql_test raw','phase3a-raw@example.com','admin_manual','unknown')
  returning id into v_raw;
  insert into public.members(display_name,email,source_system,marketing_status)
  values ('phase3a_sql_test ambiguous','phase3a-ambiguous@example.com','admin_manual','unknown')
  returning id into v_ambiguous;
  insert into public.members(display_name,email,source_system,marketing_status)
  values ('phase3a_sql_test owner','phase3a-owner@example.com','admin_manual','unknown')
  returning id into v_owner;
  insert into public.members(display_name,email,source_system,marketing_status)
  values ('phase3a_sql_test target','phase3a-target@example.com','admin_manual','unknown')
  returning id into v_target;
  insert into public.members(display_name,email,source_system,marketing_status)
  values ('phase3a_sql_test protected-owner','phase3a-protected-owner@example.com','admin_manual','unknown')
  returning id into v_protected_owner;
  insert into public.members(display_name,email,source_system,marketing_status)
  values ('phase3a_sql_test protected-target','phase3a-protected-target@example.com','admin_manual','unknown')
  returning id into v_protected_target;

  insert into public.membership_periods(member_id,entitlement_type,source,starts_on,expires_on,expiry_mode,migration_review)
  select id,'paid','phase3a_sql_test','2026-01-01','2099-01-01','fixed',false
  from public.members where id in (
    v_active,v_blocked,v_restore,v_raw,v_ambiguous,v_owner,v_target,v_protected_owner,v_protected_target
  );
  insert into public.membership_periods(member_id,entitlement_type,source,starts_on,expires_on,expiry_mode,migration_review)
  values (v_former,'paid','phase3a_sql_test','2019-01-01','2020-01-01','fixed',false);
  insert into public.membership_periods(member_id,entitlement_type,source,starts_on,expires_on,expiry_mode,migration_review)
  values (v_lifetime,'lifetime','phase3a_sql_test','2026-01-01',null,'lifetime',false);

  -- ACTIVE issuance is 24 hours and replacement revokes the previous live token.
  select version into v_version from public.member_safeguarding_state where member_id=v_active;
  select token_id,expires_at,revoked_count into v_token,v_expires,v_revoked
  from public.admin_issue_telegram_link_token(
    v_active,v_version,repeat('a',64),'phase3a-sql-test'
  );
  if v_token is null or v_revoked<>0 then raise exception 'Initial ACTIVE token issuance failed'; end if;
  if v_expires < now()+interval '23 hours 59 minutes'
     or v_expires > now()+interval '24 hours 1 minute' then
    raise exception 'Token expiry was not 24 hours';
  end if;
  if (select count(*) from public.admin_get_telegram_link_status(v_active))<>1 then
    raise exception 'Pending token metadata RPC did not return one live token';
  end if;

  select token_id,expires_at,revoked_count into v_token2,v_expires,v_revoked
  from public.admin_issue_telegram_link_token(
    v_active,v_version,repeat('b',64),'phase3a-sql-test'
  );
  if v_token2=v_token or v_revoked<>1 then raise exception 'Replacement issuance did not revoke prior token'; end if;
  if not exists(
    select 1 from public.telegram_link_tokens
    where id=v_token and revoked_at is not null and consumed_at is null
  ) then raise exception 'Replaced token was not revoked'; end if;

  -- ACTIVE link succeeds, username is normalized, and same update is idempotent.
  select result_code,member_id,telegram_account_id,linked_at,replayed
  into v_result,v_member,v_account,v_linked,v_replayed
  from public.telegram_consume_identity_link_v2(repeat('b',64),100001,710000001,'@Phase3A_Active');
  if v_result<>'LINKED' or v_member<>v_active or v_account is null or v_replayed then
    raise exception 'ACTIVE consume/link failed';
  end if;
  if not exists(
    select 1 from public.telegram_accounts
    where id=v_account and member_id=v_active and telegram_user_id=710000001
      and telegram_username='phase3a_active' and dm_available
      and linked_at is not null and bot_started_at is not null and last_verified_at is not null
  ) then raise exception 'Verified Telegram account facts invalid'; end if;
  if not exists(
    select 1 from public.audit_log
    where action='TELEGRAM_IDENTITY_LINKED' and entity_id=v_account::text
      and after_data->>'vip_group_access_changed'='false'
  ) then raise exception 'Successful link audit missing'; end if;

  select result_code,member_id,telegram_account_id,linked_at,replayed
  into v_result,v_member,v_account,v_linked,v_replayed
  from public.telegram_consume_identity_link_v2(repeat('b',64),100001,710000001,'@Phase3A_Active');
  if v_result<>'ALREADY_LINKED_IDEMPOTENT' or not v_replayed then
    raise exception 'Same Telegram update was not idempotent';
  end if;
  select result_code into v_result
  from public.telegram_consume_identity_link_v2(repeat('b',64),100002,710000001,'@Phase3A_Active');
  if v_result<>'TOKEN_CONSUMED' then raise exception 'Different update reused consumed token'; end if;

  -- LIFETIME and pending-restoration ACTIVE members remain eligible for identity-only verification.
  select version into v_version from public.member_safeguarding_state where member_id=v_lifetime;
  perform public.admin_issue_telegram_link_token(v_lifetime,v_version,repeat('c',64),'phase3a-sql-test');
  select result_code into v_result
  from public.telegram_consume_identity_link_v2(repeat('c',64),100003,710000003,null);
  if v_result<>'LINKED' then raise exception 'LIFETIME verification failed'; end if;
  if not exists(
    select 1 from public.telegram_accounts where member_id=v_lifetime and telegram_user_id=710000003
      and telegram_username is null
  ) then raise exception 'No-username verification did not store NULL username'; end if;

  update public.member_safeguarding_state
  set ever_blocked=true,access_restoration_required=true,last_unblocked_at=now(),
      last_unblocked_by='phase3a-sql-test',version=version+1,updated_at=now()
  where member_id=v_restore;
  select version into v_version from public.member_safeguarding_state where member_id=v_restore;
  perform public.admin_issue_telegram_link_token(v_restore,v_version,repeat('d',64),'phase3a-sql-test');
  select result_code into v_result
  from public.telegram_consume_identity_link_v2(repeat('d',64),100004,710000004,'phase3a_restore');
  if v_result<>'LINKED' then raise exception 'Pending restoration incorrectly blocked identity verification'; end if;

  -- FORMER and Blocked members cannot issue links.
  select version into v_version from public.member_safeguarding_state where member_id=v_former;
  begin
    perform public.admin_issue_telegram_link_token(v_former,v_version,repeat('e',64),'phase3a-sql-test');
    raise exception 'Expected FORMER issuance rejection';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'TELEGRAM_LINK_MEMBER_INELIGIBLE' then raise; end if;
  end;

  select version into v_version from public.member_safeguarding_state where member_id=v_blocked;
  perform public.admin_issue_telegram_link_token(v_blocked,v_version,repeat('f',64),'phase3a-sql-test');
  update public.member_safeguarding_state
  set is_blocked=true,ever_blocked=true,blocked_at=now(),blocked_by='phase3a-sql-test',
      blocked_summary='phase3a SQL Block',version=version+1,updated_at=now()
  where member_id=v_blocked;
  if not exists(
    select 1 from public.telegram_link_tokens
    where member_id=v_blocked and token_hash=repeat('f',64) and revoked_at is not null
  ) then raise exception 'Block transition did not revoke pending token'; end if;
  select result_code into v_result
  from public.telegram_consume_identity_link_v2(repeat('f',64),100005,710000005,'phase3a_blocked');
  if v_result<>'TOKEN_REVOKED' then raise exception 'Revoked token did not remain unusable'; end if;
  select version into v_version from public.member_safeguarding_state where member_id=v_blocked;
  begin
    perform public.admin_issue_telegram_link_token(v_blocked,v_version,repeat('0',64),'phase3a-sql-test');
    raise exception 'Expected Blocked issuance rejection';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'TELEGRAM_LINK_MEMBER_BLOCKED' then raise; end if;
  end;

  -- Raw-only legacy reference upgrades in place and preserves raw source text.
  insert into public.telegram_accounts(member_id,telegram_raw)
  values (v_raw,'legacy raw phase3a reference')
  returning id into v_account;
  select version into v_version from public.member_safeguarding_state where member_id=v_raw;
  perform public.admin_issue_telegram_link_token(v_raw,v_version,repeat('1',64),'phase3a-sql-test');
  select result_code,telegram_account_id into v_result,v_token
  from public.telegram_consume_identity_link_v2(repeat('1',64),100006,710000006,'phase3a_raw');
  if v_result<>'LINKED' or v_token<>v_account then raise exception 'Raw-only Telegram row was not upgraded in place'; end if;
  if (select telegram_raw from public.telegram_accounts where id=v_account)<>'legacy raw phase3a reference' then
    raise exception 'telegram_raw was not preserved';
  end if;

  -- The canonical one-row-per-member index prevents ambiguous legacy Telegram rows.
  insert into public.telegram_accounts(member_id,telegram_username)
  values (v_ambiguous,'phase3a_ambig_one');
  begin
    insert into public.telegram_accounts(member_id,telegram_username)
    values (v_ambiguous,'phase3a_ambig_two');
    raise exception 'Expected one-Telegram-row-per-member uniqueness failure';
  exception when unique_violation then null;
  end;

  -- Existing numeric owner and existing different verified ID are hard conflicts.
  insert into public.telegram_accounts(member_id,telegram_user_id,telegram_username,linked_at,bot_started_at,dm_available,last_verified_at)
  values (v_owner,710000008,'phase3a_owner',now(),now(),true,now());
  select version into v_version from public.member_safeguarding_state where member_id=v_target;
  perform public.admin_issue_telegram_link_token(v_target,v_version,repeat('3',64),'phase3a-sql-test');
  select result_code into v_result
  from public.telegram_consume_identity_link_v2(repeat('3',64),100008,710000008,'phase3a_target');
  if v_result<>'TELEGRAM_ID_OWNED' then raise exception 'Cross-member numeric owner was not rejected'; end if;

  insert into public.telegram_accounts(member_id,telegram_user_id,telegram_username,linked_at,bot_started_at,dm_available,last_verified_at)
  values (v_target,710000009,'phase3a_target_existing',now(),now(),true,now());
  select version into v_version from public.member_safeguarding_state where member_id=v_target;
  begin
    perform public.admin_issue_telegram_link_token(v_target,v_version,repeat('4',64),'phase3a-sql-test');
    raise exception 'Expected already-verified issuance rejection';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'TELEGRAM_LINK_ALREADY_VERIFIED' then raise; end if;
  end;

  -- Current username ownership is a hard conflict.
  insert into public.telegram_accounts(member_id,telegram_username)
  values (v_protected_owner,'phase3a_current_name');
  select version into v_version from public.member_safeguarding_state where member_id=v_protected_target;
  perform public.admin_issue_telegram_link_token(v_protected_target,v_version,repeat('5',64),'phase3a-sql-test');
  select result_code into v_result
  from public.telegram_consume_identity_link_v2(repeat('5',64),100009,710000010,'phase3a_current_name');
  if v_result<>'TELEGRAM_USERNAME_CONFLICT' then raise exception 'Current username owner conflict was not rejected'; end if;

  -- Ever-blocked verification captures protected identity; repeating same member is idempotent.
  update public.member_safeguarding_state
  set ever_blocked=true,last_unblocked_at=now(),last_unblocked_by='phase3a-sql-test',
      version=version+1,updated_at=now()
  where member_id=v_protected_owner;
  delete from public.telegram_accounts where member_id=v_protected_owner;
  select version into v_version from public.member_safeguarding_state where member_id=v_protected_owner;
  perform public.admin_issue_telegram_link_token(v_protected_owner,v_version,repeat('6',64),'phase3a-sql-test');
  select result_code into v_result
  from public.telegram_consume_identity_link_v2(repeat('6',64),100010,710000011,'phase3a_protected');
  if v_result<>'LINKED' then raise exception 'Ever-blocked verified linkage failed'; end if;
  if not exists(
    select 1 from public.member_protected_identifiers
    where member_id=v_protected_owner and identifier_type='telegram_user_id' and normalized_value='710000011'
      and capture_source='telegram_verified'
  ) then raise exception 'Verified numeric ID was not protected'; end if;
  if not exists(
    select 1 from public.member_protected_identifiers
    where member_id=v_protected_owner and identifier_type='telegram_username' and normalized_value='phase3a_protected'
      and capture_source='telegram_verified'
  ) then raise exception 'Verified username was not protected'; end if;
  select count(*) into v_count from public.member_safeguarding_events
  where member_id=v_protected_owner and event_type='PROTECTED_IDENTIFIER_CAPTURED';
  perform public.cm_protect_member_identifier(
    v_protected_owner,'telegram_user_id','710000011','telegram_verified','phase3a-sql-test',null
  );
  if (select count(*) from public.member_safeguarding_events
      where member_id=v_protected_owner and event_type='PROTECTED_IDENTIFIER_CAPTURED')<>v_count then
    raise exception 'Same-member protected identifier was not idempotent';
  end if;

  -- Remove the current Telegram account so the next cases exercise protected history,
  -- rather than the earlier current-owner conflict checks.
  delete from public.telegram_accounts where member_id=v_protected_owner;

  -- Protected numeric and username identifiers cannot be linked to another canonical member.
  select version into v_version from public.member_safeguarding_state where member_id=v_protected_target;
  perform public.admin_issue_telegram_link_token(v_protected_target,v_version,repeat('7',64),'phase3a-sql-test');
  select result_code into v_result
  from public.telegram_consume_identity_link_v2(repeat('7',64),100011,710000011,'phase3a_other');
  if v_result<>'PROTECTED_IDENTIFIER_CONFLICT' then
    raise exception 'Protected numeric identifier conflict was not rejected';
  end if;

  perform public.admin_issue_telegram_link_token(v_protected_target,v_version,repeat('8',64),'phase3a-sql-test');
  select result_code into v_result
  from public.telegram_consume_identity_link_v2(repeat('8',64),100012,710000013,'phase3a_protected');
  if v_result<>'PROTECTED_IDENTIFIER_CONFLICT' then
    raise exception 'Protected username conflict was not rejected';
  end if;

  select version into v_version from public.member_safeguarding_state where member_id=v_raw;
  begin
    perform public.admin_issue_telegram_link_token(v_raw,v_version,repeat('9',64),'phase3a-sql-test');
    raise exception 'Expected already verified raw-member issuance rejection';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'TELEGRAM_LINK_ALREADY_VERIFIED' then raise; end if;
  end;

  -- Database uniqueness independently prevents a second verified account for one member.
  begin
    insert into public.telegram_accounts(member_id,telegram_user_id)
    values (v_active,710000012);
    raise exception 'Expected one-verified-account-per-member uniqueness failure';
  exception when unique_violation then null;
  end;

  -- Failed linking never consumes the token or mutates identity.
  if not exists(
    select 1 from public.telegram_link_tokens
    where member_id=v_protected_target and token_hash=repeat('7',64) and consumed_at is null
  ) then raise exception 'Rejected token was incorrectly consumed'; end if;
end;
$$;

do $$
declare
  v_before_group bigint;
  v_after_group bigint;
  v_before_settings jsonb;
  v_after_settings jsonb;
begin
  select telegram_group_access_count,automation_settings
  into v_before_group,v_before_settings
  from phase3a_test_baseline;

  select count(*) into v_after_group from public.telegram_group_access;
  select coalesce((
    select jsonb_object_agg(setting_key,setting_value order by setting_key)
    from public.system_settings
    where setting_key in (
      'automatic_reminders_enabled',
      'automatic_removals_enabled',
      'campaign_sending_enabled',
      'payment_auto_activation_enabled'
    )
  ), '{}'::jsonb) into v_after_settings;

  if v_after_group<>v_before_group then
    raise exception 'Phase 3A changed telegram_group_access';
  end if;
  if v_after_settings is distinct from v_before_settings then
    raise exception 'Phase 3A changed automation settings';
  end if;
end;
$$;

rollback;
