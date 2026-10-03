-- Rollback-only regression suite for Blocked Member Safeguarding.
-- Safe to run repeatedly after the safeguarding migration is installed.

begin;

do $$
declare
  v_active uuid;
  v_former uuid;
  v_former_username uuid;
  v_former_bot uuid;
  v_former_linked uuid;
  v_lifetime uuid;
  v_trigger_member uuid;
  v_collision_owner uuid;
  v_collision_target uuid;
  v_active_period uuid;
  v_former_period uuid;
  v_lifetime_period uuid;
  v_task uuid;
  v_block_event uuid;
  v_review uuid;
  v_version bigint;
  v_count integer;
  v_period_before jsonb;
  v_marketing_before text;
begin
  if to_regclass('public.member_safeguarding_state') is null then
    raise exception 'Missing member_safeguarding_state table';
  end if;
  if to_regclass('public.member_safeguarding_events') is null then
    raise exception 'Missing member_safeguarding_events table';
  end if;
  if to_regclass('public.member_protected_identifiers') is null then
    raise exception 'Missing member_protected_identifiers table';
  end if;  if to_regclass('public.member_safeguarding_tasks') is null then
    raise exception 'Missing member_safeguarding_tasks table';
  end if;
  if to_regclass('public.admin_member_relationship_policy') is null then
    raise exception 'Missing admin_member_relationship_policy view';
  end if;
  if to_regprocedure('public.admin_block_member(uuid,bigint,text,text,boolean,text)') is null then
    raise exception 'Missing admin_block_member RPC';
  end if;
  if to_regprocedure('public.admin_unblock_member(uuid,bigint,text,boolean,text)') is null then
    raise exception 'Missing admin_unblock_member RPC';
  end if;
  if to_regprocedure('public.admin_restore_member_access(uuid,bigint,text,boolean,text)') is null then
    raise exception 'Missing admin_restore_member_access RPC';
  end if;
  if to_regprocedure('public.admin_complete_safeguarding_task(uuid,uuid,text,text,text)') is null then
    raise exception 'Missing admin_complete_safeguarding_task RPC';
  end if;

  insert into public.members(display_name,email,source_system,marketing_status)
  values ('Safeguard Active','safeguard-active@example.com','admin_manual','allowed')
  returning id into v_active;
  insert into public.members(display_name,email,source_system,marketing_status)
  values ('Safeguard Former','safeguard-former@example.com','admin_manual','allowed')
  returning id into v_former;
  insert into public.members(display_name,email,source_system,marketing_status)
  values ('Safeguard Lifetime','safeguard-lifetime@example.com','admin_manual','unknown')
  returning id into v_lifetime;

  insert into public.membership_periods(
    member_id,entitlement_type,source,starts_on,expires_on,expiry_mode,migration_review
  ) values (
    v_active,'paid','test','2026-01-01','2099-01-01','fixed',false
  ) returning id into v_active_period;
  insert into public.membership_periods(
    member_id,entitlement_type,source,starts_on,expires_on,expiry_mode,migration_review
  ) values (
    v_former,'paid','test','2019-01-01','2020-01-01','fixed',false
  ) returning id into v_former_period;
  insert into public.membership_periods(
    member_id,entitlement_type,source,starts_on,expires_on,expiry_mode,migration_review
  ) values (
    v_lifetime,'lifetime','test','2026-01-01',null,'lifetime',false
  ) returning id into v_lifetime_period;

  if (select count(*) from public.member_safeguarding_state
      where member_id in (v_active,v_former,v_lifetime)) <> 3 then
    raise exception 'Member insert trigger did not create one safeguarding state per member';
  end if;
  if exists (
    select 1 from public.member_safeguarding_state
    where member_id in (v_active,v_former,v_lifetime)
      and (is_blocked or ever_blocked or access_restoration_required or version<>0)
  ) then raise exception 'New safeguarding state is not neutral'; end if;

  insert into public.members(display_name,source_system,marketing_status)
  values ('Safeguard Trigger','admin_manual','unknown') returning id into v_trigger_member;
  if not exists(select 1 from public.member_safeguarding_state where member_id=v_trigger_member) then
    raise exception 'Future member safeguarding trigger missing';
  end if;
  begin
    update public.member_safeguarding_state
    set is_blocked=true, ever_blocked=false, blocked_at=now(), blocked_by='sql-test',
        blocked_summary='Invalid state'
    where member_id=v_trigger_member;
    raise exception 'Expected safeguarding state constraint failure';
  exception when check_violation then null;
  end;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='member_safeguarding_state' and c.relrowsecurity
  ) then raise exception 'Safeguarding state RLS is not enabled'; end if;

  if not exists (
    select 1 from public.admin_member_relationship_policy p
    where p.member_id=v_active and p.membership_status='ACTIVE'
      and p.is_blocked=false and p.ever_blocked=false
      and p.effective_access_restoration_required=false
      and p.contact_allowed=true and p.access_grant_allowed=true
      and p.membership_action_allowed=true and p.restore_access_allowed=false
      and p.telegram_removal_required=false
  ) then raise exception 'Neutral ACTIVE relationship policy invalid'; end if;

  if not exists (
    select 1 from public.admin_member_relationship_policy p
    where p.member_id=v_former and p.membership_status='FORMER'
      and p.contact_allowed=true and p.access_grant_allowed=false
      and p.membership_action_allowed=true and p.restore_access_allowed=false
  ) then raise exception 'Neutral FORMER relationship policy invalid'; end if;

  delete from public.member_safeguarding_state where member_id=v_trigger_member;
  if not exists (
    select 1 from public.admin_member_relationship_policy p
    where p.member_id=v_trigger_member
      and p.safeguarding_state_present=false
      and p.contact_allowed=false and p.access_grant_allowed=false
      and p.membership_action_allowed=false and p.restore_access_allowed=false
  ) then raise exception 'Missing safeguarding state did not fail closed'; end if;
  insert into public.member_safeguarding_state(member_id) values (v_trigger_member);

  update public.member_safeguarding_state
  set is_blocked=true,ever_blocked=true,blocked_at=now(),blocked_by='sql-test',
      blocked_summary='Blocked policy test',version=version+1
  where member_id in (v_active,v_former,v_lifetime);

  if exists (
    select 1 from public.admin_member_relationship_policy p
    where p.member_id in (v_active,v_former,v_lifetime)
      and (p.contact_allowed or p.access_grant_allowed or p.membership_action_allowed
           or p.restore_access_allowed)
  ) then raise exception 'Blocked policy allowed a prohibited relationship action'; end if;

  update public.member_safeguarding_state
  set is_blocked=false,blocked_at=null,blocked_by=null,blocked_summary=null,
      access_restoration_required=true,last_unblocked_at=now(),last_unblocked_by='sql-test',
      version=version+1
  where member_id in (v_active,v_lifetime);

  if not exists (
    select 1 from public.admin_member_relationship_policy p
    where p.member_id=v_active and p.effective_access_restoration_required=true
      and p.contact_allowed=true and p.access_grant_allowed=false
      and p.membership_action_allowed=false and p.restore_access_allowed=true
  ) then raise exception 'ACTIVE restoration-required policy invalid'; end if;

  if not exists (
    select 1 from public.admin_member_relationship_policy p
    where p.member_id=v_lifetime and p.membership_status='LIFETIME'
      and p.effective_access_restoration_required=true
      and p.access_grant_allowed=false and p.membership_action_allowed=false
      and p.restore_access_allowed=true
  ) then raise exception 'LIFETIME restoration-required policy invalid'; end if;

  update public.member_safeguarding_state
  set is_blocked=false,blocked_at=null,blocked_by=null,blocked_summary=null,
      access_restoration_required=true,last_unblocked_at=now(),last_unblocked_by='sql-test',
      version=version+1
  where member_id=v_former;

  if not exists (
    select 1 from public.admin_member_relationship_policy p
    where p.member_id=v_former and p.membership_status='FORMER'
      and p.access_restoration_required=true
      and p.effective_access_restoration_required=false
      and p.contact_allowed=true and p.access_grant_allowed=false
      and p.membership_action_allowed=true and p.restore_access_allowed=false
  ) then raise exception 'Expired stored restoration flag remained effective'; end if;

  -- Reset synthetic state so transition RPC tests begin from neutral rows.
  update public.member_safeguarding_state
  set is_blocked=false,ever_blocked=false,blocked_at=null,blocked_by=null,blocked_summary=null,
      access_restoration_required=false,last_unblocked_at=null,last_unblocked_by=null,version=0
  where member_id in (v_active,v_former,v_lifetime);

  insert into public.telegram_accounts(
    member_id,telegram_username,telegram_user_id,linked_at,dm_available
  ) values (
    v_active,'@Safeguard_Active',987654321,now(),true
  );
  select marketing_status into v_marketing_before from public.members where id=v_active;
  update public.membership_periods set migration_review=true where id=v_active_period;
  select review_case_id into v_review from public.admin_open_member_review_case(
    v_active,v_active_period,null,'membership','Safeguarding test Review remains independent','sql-test'
  );
  select to_jsonb(mp) into v_period_before from public.membership_periods mp where mp.id=v_active_period;

  select safeguarding_version,event_id,task_id
  into v_version,v_block_event,v_task
  from public.admin_block_member(
    v_active,0,'Permanent safeguarding restriction',
    'Threatening conduct; no further contact or access','true','sql-test'
  );
  if v_version<>1 or v_block_event is null or v_task is null then
    raise exception 'Block RPC return invalid';
  end if;
  if not exists (
    select 1 from public.member_safeguarding_state s
    where s.member_id=v_active and s.is_blocked and s.ever_blocked
      and s.blocked_by='sql-test' and s.blocked_summary='Permanent safeguarding restriction'
      and s.version=1 and not s.access_restoration_required
  ) then raise exception 'Block state invalid'; end if;
  if not exists (
    select 1 from public.member_safeguarding_events e
    where e.id=v_block_event and e.member_id=v_active and e.event_type='MEMBER_BLOCKED'
      and e.summary='Permanent safeguarding restriction'
      and e.reason='Threatening conduct; no further contact or access'
      and e.actor_id='sql-test'
  ) then raise exception 'Block safeguarding event missing'; end if;
  if not exists (
    select 1 from public.audit_log a
    where a.action='MEMBER_BLOCKED' and a.entity_type='member_safeguarding_state'
      and a.entity_id=v_active::text and a.actor_id='sql-test'
  ) then raise exception 'Block general audit missing'; end if;
  if not exists (
    select 1 from public.member_protected_identifiers i
    where i.member_id=v_active and i.identifier_type='email'
      and i.normalized_value='safeguard-active@example.com' and i.capture_source='block_snapshot'
  ) then raise exception 'Blocked email was not protected'; end if;
  if not exists (
    select 1 from public.member_protected_identifiers i
    where i.member_id=v_active and i.identifier_type='telegram_username'
      and i.normalized_value='safeguard_active' and i.capture_source='block_snapshot'
  ) then raise exception 'Blocked Telegram username was not protected'; end if;
  if not exists (
    select 1 from public.member_protected_identifiers i
    where i.member_id=v_active and i.identifier_type='telegram_user_id'
      and i.normalized_value='987654321' and i.capture_source='block_snapshot'
  ) then raise exception 'Blocked numeric Telegram ID was not protected'; end if;

  if not exists (
    select 1 from public.member_safeguarding_tasks t
    where t.id=v_task and t.member_id=v_active and t.block_event_id=v_block_event
      and t.task_type='telegram_removal' and t.status='OPEN' and t.outcome is null
  ) then raise exception 'ACTIVE Block did not create Telegram removal task'; end if;
  if not exists (
    select 1 from public.member_safeguarding_events e
    where e.member_id=v_active and e.event_type='TELEGRAM_REMOVAL_REQUIRED'
      and e.metadata->>'task_id'=v_task::text
  ) then raise exception 'Telegram removal required event missing'; end if;
  if not exists (
    select 1 from public.admin_member_relationship_policy p
    where p.member_id=v_active and p.telegram_removal_required=true
  ) then raise exception 'Open Telegram removal task absent from policy'; end if;

  begin
    perform * from public.admin_block_member(
      v_active,0,'Stale block','Stale retry',true,'sql-test'
    );
    raise exception 'Expected SAFEGUARDING_STALE_STATE';
  exception when others then
    if sqlerrm<>'SAFEGUARDING_STALE_STATE' then raise; end if;
  end;
  begin
    perform * from public.admin_block_member(
      v_active,1,'Double block','Double block',true,'sql-test'
    );
    raise exception 'Expected MEMBER_ALREADY_BLOCKED';
  exception when others then
    if sqlerrm<>'MEMBER_ALREADY_BLOCKED' then raise; end if;
  end;
  begin
    perform * from public.admin_block_member(
      v_former,0,'Unconfirmed block','No confirmation',false,'sql-test'
    );
    raise exception 'Expected SAFEGUARDING_CONFIRMATION_REQUIRED';
  exception when others then
    if sqlerrm<>'SAFEGUARDING_CONFIRMATION_REQUIRED' then raise; end if;
  end;

  if (select marketing_status from public.members where id=v_active) is distinct from v_marketing_before then
    raise exception 'Block changed marketing_status';
  end if;
  if (select to_jsonb(mp) from public.membership_periods mp where mp.id=v_active_period)
       is distinct from v_period_before then
    raise exception 'Block changed membership period facts';
  end if;

  select safeguarding_version,task_id into v_version,v_task
  from public.admin_block_member(
    v_former,0,'Former no contact','Former safeguarding restriction',true,'sql-test'
  );
  if v_version<>1 or v_task is not null then
    raise exception 'FORMER without access evidence created Telegram task';
  end if;

  insert into public.members(display_name,source_system,marketing_status)
  values ('Former Username Only','admin_manual','unknown') returning id into v_former_username;
  insert into public.membership_periods(
    member_id,entitlement_type,source,starts_on,expires_on,expiry_mode,migration_review
  ) values (v_former_username,'paid','test','2019-01-01','2020-01-01','fixed',false);
  insert into public.telegram_accounts(member_id,telegram_username,dm_available)
  values (v_former_username,'former_username',false);
  select task_id into v_task from public.admin_block_member(
    v_former_username,0,'Former username','Username alone is not access evidence',true,'sql-test'
  );
  if v_task is not null then raise exception 'Telegram username alone created removal task'; end if;

  insert into public.members(display_name,source_system,marketing_status)
  values ('Former Bot Only','admin_manual','unknown') returning id into v_former_bot;
  insert into public.membership_periods(
    member_id,entitlement_type,source,starts_on,expires_on,expiry_mode,migration_review
  ) values (v_former_bot,'paid','test','2019-01-01','2020-01-01','fixed',false);
  insert into public.telegram_accounts(member_id,telegram_username,bot_started_at,dm_available)
  values (v_former_bot,'former_bot',now(),false);
  select task_id into v_task from public.admin_block_member(
    v_former_bot,0,'Former bot','Bot start alone is not access evidence',true,'sql-test'
  );
  if v_task is not null then raise exception 'bot_started_at alone created removal task'; end if;

  insert into public.members(display_name,source_system,marketing_status)
  values ('Former Linked','admin_manual','unknown') returning id into v_former_linked;
  insert into public.membership_periods(
    member_id,entitlement_type,source,starts_on,expires_on,expiry_mode,migration_review
  ) values (v_former_linked,'paid','test','2019-01-01','2020-01-01','fixed',false);
  insert into public.telegram_accounts(member_id,telegram_user_id,dm_available)
  values (v_former_linked,123456789,false);
  select task_id into v_task from public.admin_block_member(
    v_former_linked,0,'Former linked','Numeric identity suggests possible access',true,'sql-test'
  );
  if v_task is null then raise exception 'FORMER with Telegram access evidence lacked removal task'; end if;

  -- Active unblock creates restoration-required state without restoring entitlement access.
  select safeguarding_version into v_version from public.admin_unblock_member(
    v_active,1,'Safeguarding restriction lifted after review',true,'sql-test'
  );
  if v_version<>2 then raise exception 'Unblock version invalid'; end if;
  if not exists (
    select 1 from public.member_safeguarding_state s
    where s.member_id=v_active and not s.is_blocked and s.ever_blocked
      and s.access_restoration_required and s.last_unblocked_by='sql-test' and s.version=2
  ) then raise exception 'ACTIVE Unblock did not require access restoration'; end if;
  if not exists (
    select 1 from public.member_safeguarding_events e
    where e.member_id=v_active and e.event_type='MEMBER_UNBLOCKED'
      and e.reason='Safeguarding restriction lifted after review' and e.actor_id='sql-test'
  ) then raise exception 'Unblock safeguarding event missing'; end if;
  if (select count(*) from public.member_protected_identifiers where member_id=v_active)<>3 then
    raise exception 'Unblock released protected identifiers';
  end if;
  begin
    perform * from public.admin_unblock_member(
      v_active,2,'Repeat unblock',true,'sql-test'
    );
    raise exception 'Expected MEMBER_NOT_BLOCKED';
  exception when others then
    if sqlerrm<>'MEMBER_NOT_BLOCKED' then raise; end if;
  end;

  select safeguarding_version into v_version from public.admin_unblock_member(
    v_former,1,'Former block lifted',true,'sql-test'
  );
  if not exists (
    select 1 from public.member_safeguarding_state s
    where s.member_id=v_former and not s.is_blocked
      and not s.access_restoration_required and s.version=v_version
  ) then raise exception 'FORMER Unblock incorrectly required access restoration'; end if;

  select safeguarding_version into v_version from public.admin_block_member(
    v_lifetime,0,'Lifetime block','Lifetime safeguarding restriction',true,'sql-test'
  );
  select safeguarding_version into v_version from public.admin_unblock_member(
    v_lifetime,v_version,'Lifetime block lifted',true,'sql-test'
  );
  if not exists (
    select 1 from public.member_safeguarding_state s
    where s.member_id=v_lifetime and s.access_restoration_required
  ) then raise exception 'LIFETIME Unblock did not require access restoration'; end if;

  begin
    perform * from public.admin_restore_member_access(
      v_lifetime,v_version,'Missing restore acknowledgement',false,'sql-test'
    );
    raise exception 'Expected SAFEGUARDING_CONFIRMATION_REQUIRED for Restore Access';
  exception when others then
    if sqlerrm<>'SAFEGUARDING_CONFIRMATION_REQUIRED' then raise; end if;
  end;

  select safeguarding_version into v_version from public.admin_restore_member_access(
    v_active,2,'Restore existing paid access deliberately',true,'sql-test'
  );
  if v_version<>3 then raise exception 'ACTIVE Restore Access version invalid'; end if;
  if not exists (
    select 1 from public.member_safeguarding_state s
    where s.member_id=v_active and not s.is_blocked and not s.access_restoration_required
      and s.version=3
  ) then raise exception 'ACTIVE Restore Access state invalid'; end if;
  if (select to_jsonb(mp) from public.membership_periods mp where mp.id=v_active_period)
       is distinct from v_period_before then
    raise exception 'Restore Access rewrote existing entitlement facts';
  end if;
  if not exists (
    select 1 from public.member_safeguarding_events e
    where e.member_id=v_active and e.event_type='MEMBER_ACCESS_RESTORED'
      and e.reason='Restore existing paid access deliberately'
  ) then raise exception 'Restore Access safeguarding event missing'; end if;

  begin
    perform * from public.admin_restore_member_access(
      v_active,3,'Repeat restore',true,'sql-test'
    );
    raise exception 'Expected ACCESS_RESTORATION_NOT_REQUIRED';
  exception when others then
    if sqlerrm<>'ACCESS_RESTORATION_NOT_REQUIRED' then raise; end if;
  end;

  select safeguarding_version into v_version from public.member_safeguarding_state where member_id=v_lifetime;
  select safeguarding_version into v_version from public.admin_restore_member_access(
    v_lifetime,v_version,'Restore existing lifetime access deliberately',true,'sql-test'
  );
  if not exists (
    select 1 from public.member_safeguarding_state s
    where s.member_id=v_lifetime and not s.is_blocked and not s.access_restoration_required
  ) then raise exception 'LIFETIME Restore Access state invalid'; end if;

  update public.member_safeguarding_state
  set access_restoration_required=true,version=version+1
  where member_id=v_former;
  select version into v_version from public.member_safeguarding_state where member_id=v_former;
  begin
    perform * from public.admin_restore_member_access(
      v_former,v_version,'Expired restore attempt',true,'sql-test'
    );
    raise exception 'Expected ACCESS_RESTORATION_EXPIRED';
  exception when others then
    if sqlerrm<>'ACCESS_RESTORATION_EXPIRED' then raise; end if;
  end;

  -- Completing a manual Telegram-removal task is audited but does not alter safeguarding state.
  select id into v_task from public.member_safeguarding_tasks
  where member_id=v_active and status='OPEN' order by required_at limit 1;
  perform * from public.admin_complete_safeguarding_task(
    v_active,v_task,'REMOVED_FROM_TELEGRAM','Removed manually from all VIP groups','sql-test'
  );
  if not exists (
    select 1 from public.member_safeguarding_tasks t
    where t.id=v_task and t.status='COMPLETED' and t.outcome='REMOVED_FROM_TELEGRAM'
      and t.completed_by='sql-test' and t.completed_at is not null
  ) then raise exception 'Telegram removal completion invalid'; end if;
  if not exists (
    select 1 from public.member_safeguarding_events e
    where e.member_id=v_active and e.event_type='TELEGRAM_REMOVAL_COMPLETED'
      and e.metadata->>'task_id'=v_task::text
  ) then raise exception 'Telegram removal completion event missing'; end if;
  if not exists (
    select 1 from public.audit_log a
    where a.action='TELEGRAM_REMOVAL_COMPLETED' and a.entity_id=v_task::text
      and a.actor_id='sql-test'
  ) then raise exception 'Telegram removal completion audit missing'; end if;
  if not exists (
    select 1 from public.member_safeguarding_state s
    where s.member_id=v_active and not s.is_blocked and not s.access_restoration_required
      and s.version=3
  ) then raise exception 'Task completion changed member safeguarding state'; end if;
  begin
    perform * from public.admin_complete_safeguarding_task(
      v_active,v_task,'REMOVED_FROM_TELEGRAM','Repeat completion','sql-test'
    );
    raise exception 'Expected SAFEGUARDING_TASK_NOT_OPEN';
  exception when others then
    if sqlerrm<>'SAFEGUARDING_TASK_NOT_OPEN' then raise; end if;
  end;

  select id into v_task from public.member_safeguarding_tasks
  where member_id=v_former_linked and status='OPEN' order by required_at limit 1;
  perform * from public.admin_complete_safeguarding_task(
    v_former_linked,v_task,'CONFIRMED_NOT_PRESENT_OR_NO_ACCESS',
    'Checked Telegram; no current access remained','sql-test'
  );
  if not exists (
    select 1 from public.member_safeguarding_events e
    where e.member_id=v_former_linked and e.event_type='TELEGRAM_NO_ACCESS_CONFIRMED'
  ) then raise exception 'No-access task outcome event missing'; end if;

  -- Existing Review state and migration provenance survive safeguarding transitions.
  if not exists (
    select 1 from public.member_review_cases rc where rc.id=v_review and rc.status='OPEN'
  ) then raise exception 'Safeguarding transition changed Review case'; end if;
  if (select migration_review from public.membership_periods where id=v_active_period) is not true then
    raise exception 'Safeguarding transition cleared migration_review';
  end if;
  if (select marketing_status from public.members where id=v_active) is distinct from v_marketing_before then
    raise exception 'Safeguarding lifecycle changed marketing_status';
  end if;

  -- Missing current state fails closed at the mutation boundary too.
  delete from public.member_safeguarding_state where member_id=v_trigger_member;
  begin
    perform * from public.admin_block_member(
      v_trigger_member,0,'Missing state block','Must fail closed',true,'sql-test'
    );
    raise exception 'Expected SAFEGUARDING_STATE_MISSING';
  exception when others then
    if sqlerrm<>'SAFEGUARDING_STATE_MISSING' then raise; end if;
  end;
  insert into public.member_safeguarding_state(member_id) values (v_trigger_member);

  -- A protected-identity conflict must roll the entire Block transaction back.
  insert into public.members(display_name,email,source_system,marketing_status)
  values ('Collision Owner','collision-owner@example.com','admin_manual','unknown')
  returning id into v_collision_owner;
  insert into public.members(display_name,email,source_system,marketing_status)
  values ('Collision Target','collision@example.com','admin_manual','unknown')
  returning id into v_collision_target;
  insert into public.member_safeguarding_events(
    member_id,event_type,actor_id,reason,metadata
  ) values (
    v_collision_owner,'PROTECTED_IDENTIFIER_CAPTURED','sql-test','Collision fixture','{}'::jsonb
  ) returning id into v_block_event;
  insert into public.member_protected_identifiers(
    member_id,identifier_type,normalized_value,capture_source,captured_by,safeguarding_event_id
  ) values (
    v_collision_owner,'email','collision@example.com','identity_correction','sql-test',v_block_event
  );
  begin
    perform * from public.admin_block_member(
      v_collision_target,0,'Collision block','Must roll back on protected identity conflict',true,'sql-test'
    );
    raise exception 'Expected PROTECTED_IDENTITY_CONFLICT';
  exception when others then
    if sqlerrm<>'PROTECTED_IDENTITY_CONFLICT' then raise; end if;
  end;
  if not exists (
    select 1 from public.member_safeguarding_state s
    where s.member_id=v_collision_target and not s.is_blocked and not s.ever_blocked and s.version=0
  ) then raise exception 'Protected identity collision left partial Block state'; end if;
  if exists (
    select 1 from public.member_safeguarding_events e
    where e.member_id=v_collision_target and e.event_type='MEMBER_BLOCKED'
  ) then raise exception 'Protected identity collision left Block event'; end if;
  if exists (
    select 1 from public.member_safeguarding_tasks t where t.member_id=v_collision_target
  ) then raise exception 'Protected identity collision left safeguarding task'; end if;

  select count(*) into v_count from public.member_safeguarding_state
  where member_id in (v_active,v_former,v_lifetime,v_trigger_member,v_collision_owner,v_collision_target);
  if v_count<>6 then raise exception 'Safeguarding state row count invariant failed'; end if;
end $$;

rollback;

do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.admin_block_member(uuid,bigint,text,text,boolean,text)',
    'public.admin_unblock_member(uuid,bigint,text,boolean,text)',
    'public.admin_restore_member_access(uuid,bigint,text,boolean,text)',
    'public.admin_complete_safeguarding_task(uuid,uuid,text,text,text)'
  ] loop
    if not has_function_privilege('service_role',v_sig,'EXECUTE') then
      raise exception 'service_role cannot execute %',v_sig;
    end if;
    if has_function_privilege('anon',v_sig,'EXECUTE')
       or has_function_privilege('authenticated',v_sig,'EXECUTE') then
      raise exception 'Browser role can execute %',v_sig;
    end if;
  end loop;

  if not has_table_privilege('service_role','public.member_safeguarding_state','SELECT')
     or not has_table_privilege('service_role','public.member_safeguarding_events','SELECT')
     or not has_table_privilege('service_role','public.member_protected_identifiers','SELECT')
     or not has_table_privilege('service_role','public.member_safeguarding_tasks','SELECT')
     or not has_table_privilege('service_role','public.admin_member_relationship_policy','SELECT') then
    raise exception 'service_role lacks safeguarding read access';
  end if;
  if has_table_privilege('anon','public.member_safeguarding_state','SELECT')
     or has_table_privilege('authenticated','public.member_safeguarding_state','SELECT')
     or has_table_privilege('anon','public.admin_member_relationship_policy','SELECT')
     or has_table_privilege('authenticated','public.admin_member_relationship_policy','SELECT') then
    raise exception 'Browser role can read safeguarding admin data';
  end if;

  if has_table_privilege('service_role','public.member_safeguarding_events','INSERT')
     or has_table_privilege('service_role','public.member_safeguarding_events','UPDATE')
     or has_table_privilege('service_role','public.member_safeguarding_events','DELETE') then
    raise exception 'Safeguarding event history is directly mutable by service_role';
  end if;
  if has_table_privilege('service_role','public.member_safeguarding_state','UPDATE')
     or has_table_privilege('service_role','public.member_protected_identifiers','INSERT')
     or has_table_privilege('service_role','public.member_safeguarding_tasks','UPDATE') then
    raise exception 'Safeguarding state/identity/tasks bypass scoped RPCs';
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (
      'member_safeguarding_events','member_safeguarding_state',
      'member_protected_identifiers','member_safeguarding_tasks'
    ) and c.relrowsecurity
    group by n.nspname having count(*)=4
  ) then raise exception 'Not all safeguarding tables have RLS enabled'; end if;
end $$;
