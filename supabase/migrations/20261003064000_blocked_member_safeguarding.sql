-- CryptoMainly Blocked Member Safeguarding.
-- Relationship safeguarding is independent from entitlement, Review and marketing preference.

create table public.member_safeguarding_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  event_type text not null,
  actor_id text not null,
  summary text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint member_safeguarding_events_type_check check (event_type in (
    'MEMBER_BLOCKED','MEMBER_UNBLOCKED','MEMBER_ACCESS_RESTORED',
    'ACCESS_RESTORATION_REQUIRED','TELEGRAM_REMOVAL_REQUIRED',
    'TELEGRAM_REMOVAL_COMPLETED','TELEGRAM_NO_ACCESS_CONFIRMED',
    'PROTECTED_IDENTIFIER_CAPTURED'
  )),
  constraint member_safeguarding_events_actor_check
    check (btrim(actor_id)<>'' and char_length(btrim(actor_id))<=200),
  constraint member_safeguarding_events_summary_check
    check (summary is null or (btrim(summary)<>'' and char_length(btrim(summary))<=200)),
  constraint member_safeguarding_events_reason_check
    check (reason is null or (btrim(reason)<>'' and char_length(btrim(reason))<=1000))
);

create index member_safeguarding_events_member_time_idx
  on public.member_safeguarding_events(member_id, occurred_at desc, id desc);

create table public.member_safeguarding_state (
  member_id uuid primary key references public.members(id) on delete restrict,
  is_blocked boolean not null default false,
  ever_blocked boolean not null default false,
  blocked_at timestamptz,
  blocked_by text,
  blocked_summary text,
  access_restoration_required boolean not null default false,
  last_unblocked_at timestamptz,
  last_unblocked_by text,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_safeguarding_state_version_check check (version>=0),
  constraint member_safeguarding_state_blocked_by_check
    check (blocked_by is null or (btrim(blocked_by)<>'' and char_length(btrim(blocked_by))<=200)),
  constraint member_safeguarding_state_summary_check
    check (blocked_summary is null or (btrim(blocked_summary)<>'' and char_length(btrim(blocked_summary))<=200)),
  constraint member_safeguarding_state_unblocked_by_check
    check (last_unblocked_by is null or (btrim(last_unblocked_by)<>'' and char_length(btrim(last_unblocked_by))<=200)),
  constraint member_safeguarding_state_current_block_check check (
    (is_blocked and ever_blocked and blocked_at is not null and blocked_by is not null
      and blocked_summary is not null and not access_restoration_required)
    or
    (not is_blocked and blocked_at is null and blocked_by is null and blocked_summary is null)
  ),
  constraint member_safeguarding_state_restore_check
    check (not access_restoration_required or (ever_blocked and not is_blocked)),
  constraint member_safeguarding_state_unblock_pair_check
    check ((last_unblocked_at is null)=(last_unblocked_by is null))
);

create table public.member_protected_identifiers (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  identifier_type text not null,
  normalized_value text not null,
  capture_source text not null,
  captured_by text not null,
  safeguarding_event_id uuid not null references public.member_safeguarding_events(id) on delete restrict,
  captured_at timestamptz not null default now(),
  constraint member_protected_identifiers_type_check
    check (identifier_type in ('email','telegram_username','telegram_user_id')),
  constraint member_protected_identifiers_source_check
    check (capture_source in ('block_snapshot','identity_correction','telegram_verified')),
  constraint member_protected_identifiers_value_check
    check (btrim(normalized_value)<>'' and char_length(btrim(normalized_value))<=512),
  constraint member_protected_identifiers_actor_check
    check (btrim(captured_by)<>'' and char_length(btrim(captured_by))<=200),
  constraint member_protected_identifiers_unique unique(identifier_type, normalized_value)
);

create index member_protected_identifiers_member_idx
  on public.member_protected_identifiers(member_id, captured_at desc);
create index member_protected_identifiers_event_idx
  on public.member_protected_identifiers(safeguarding_event_id);

create table public.member_safeguarding_tasks (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  block_event_id uuid not null references public.member_safeguarding_events(id) on delete restrict,
  task_type text not null default 'telegram_removal',
  status text not null default 'OPEN',
  outcome text,
  required_at timestamptz not null default now(),
  required_by text not null,
  completed_at timestamptz,
  completed_by text,
  completion_note text,
  constraint member_safeguarding_tasks_type_check check (task_type='telegram_removal'),
  constraint member_safeguarding_tasks_status_check check (status in ('OPEN','COMPLETED')),
  constraint member_safeguarding_tasks_outcome_check check (
    outcome is null or outcome in ('REMOVED_FROM_TELEGRAM','CONFIRMED_NOT_PRESENT_OR_NO_ACCESS')
  ),
  constraint member_safeguarding_tasks_required_by_check
    check (btrim(required_by)<>'' and char_length(btrim(required_by))<=200),
  constraint member_safeguarding_tasks_completed_by_check
    check (completed_by is null or (btrim(completed_by)<>'' and char_length(btrim(completed_by))<=200)),
  constraint member_safeguarding_tasks_note_check
    check (completion_note is null or char_length(completion_note)<=1000),
  constraint member_safeguarding_tasks_state_check check (
    (status='OPEN' and outcome is null and completed_at is null
      and completed_by is null and completion_note is null)
    or
    (status='COMPLETED' and outcome is not null and completed_at is not null and completed_by is not null)
  ),
  constraint member_safeguarding_tasks_one_per_block unique(block_event_id, task_type)
);

create index member_safeguarding_tasks_member_status_idx
  on public.member_safeguarding_tasks(member_id, status, required_at desc);

alter table public.member_safeguarding_events enable row level security;
alter table public.member_safeguarding_state enable row level security;
alter table public.member_protected_identifiers enable row level security;
alter table public.member_safeguarding_tasks enable row level security;

create or replace function public.cm_ensure_member_safeguarding_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.member_safeguarding_state(member_id)
  values (new.id)
  on conflict (member_id) do nothing;
  return new;
end;
$$;

revoke all on function public.cm_ensure_member_safeguarding_state() from public, anon, authenticated, service_role;

drop trigger if exists members_ensure_safeguarding_state on public.members;
create trigger members_ensure_safeguarding_state
after insert on public.members
for each row execute function public.cm_ensure_member_safeguarding_state();

insert into public.member_safeguarding_state(member_id)
select m.id from public.members m
where not exists (
  select 1 from public.member_safeguarding_state s where s.member_id=m.id
);

create view public.admin_member_relationship_policy
with (security_invoker = true)
as
select
  m.id as member_id,
  (s.member_id is not null) as safeguarding_state_present,
  s.version as safeguarding_version,
  coalesce(s.is_blocked,false) as is_blocked,
  coalesce(s.ever_blocked,false) as ever_blocked,
  s.blocked_at,
  s.blocked_by,
  s.blocked_summary,
  coalesce(s.access_restoration_required,false) as access_restoration_required,
  s.last_unblocked_at,
  s.last_unblocked_by,
  cms.status as membership_status,
  cms.membership_period_id,
  cms.entitlement_type,
  (
    s.member_id is not null and not s.is_blocked
    and s.access_restoration_required
    and cms.status in ('ACTIVE','LIFETIME')
  ) as effective_access_restoration_required,
  exists (
    select 1 from public.member_safeguarding_tasks t
    where t.member_id=m.id and t.task_type='telegram_removal' and t.status='OPEN'
  ) as telegram_removal_required,
  (s.member_id is not null and not s.is_blocked) as contact_allowed,
  (
    s.member_id is not null and not s.is_blocked
    and cms.status in ('ACTIVE','LIFETIME')
    and not (s.access_restoration_required and cms.status in ('ACTIVE','LIFETIME'))
  ) as access_grant_allowed,
  (
    s.member_id is not null and not s.is_blocked and cms.status is not null
    and not (s.access_restoration_required and cms.status in ('ACTIVE','LIFETIME'))
  ) as membership_action_allowed,
  (
    s.member_id is not null and not s.is_blocked
    and s.access_restoration_required
    and cms.status in ('ACTIVE','LIFETIME')
  ) as restore_access_allowed
from public.members m
left join public.member_safeguarding_state s on s.member_id=m.id
left join public.current_member_status cms on cms.member_id=m.id;

revoke all on table public.member_safeguarding_events from public, anon, authenticated, service_role;
revoke all on table public.member_safeguarding_state from public, anon, authenticated, service_role;
revoke all on table public.member_protected_identifiers from public, anon, authenticated, service_role;
revoke all on table public.member_safeguarding_tasks from public, anon, authenticated, service_role;
revoke all on table public.admin_member_relationship_policy from public, anon, authenticated, service_role;

grant select on table public.member_safeguarding_events to service_role;
grant select on table public.member_safeguarding_state to service_role;
grant select on table public.member_protected_identifiers to service_role;
grant select on table public.member_safeguarding_tasks to service_role;
grant select on table public.admin_member_relationship_policy to service_role;

create or replace function public.cm_protect_member_identifier(
  p_member_id uuid,
  p_identifier_type text,
  p_value text,
  p_capture_source text,
  p_actor_id text,
  p_event_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value text;
  v_actor text;
  v_owner uuid;
  v_effective_event uuid;
  v_identifier_id uuid;
  v_capture_reason text;
begin
  if p_identifier_type not in ('email','telegram_username','telegram_user_id')
     or p_capture_source not in ('block_snapshot','identity_correction','telegram_verified')
     or p_member_id is null
     or (p_capture_source='block_snapshot' and p_event_id is null) then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  v_actor:=coalesce(nullif(btrim(p_actor_id),''),'vip-admin');
  v_value:=nullif(btrim(coalesce(p_value,'')),'');
  if v_value is null then return; end if;
  if p_identifier_type='email' then
    v_value:=lower(v_value);
  elsif p_identifier_type='telegram_username' then
    v_value:=lower(regexp_replace(v_value,'^@',''));
  end if;
  if v_value='' or char_length(v_value)>512 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_identifier_type||':'||v_value));
  select i.member_id into v_owner
  from public.member_protected_identifiers i
  where i.identifier_type=p_identifier_type and i.normalized_value=v_value
  for update;

  if v_owner is not null then
    if v_owner<>p_member_id then
      raise exception using errcode='P0001', message='PROTECTED_IDENTITY_CONFLICT';
    end if;
    return;
  end if;

  v_effective_event:=p_event_id;
  if p_capture_source<>'block_snapshot' then
    v_capture_reason:=case p_capture_source
      when 'telegram_verified' then 'Protected identity retained after verified Telegram linkage.'
      else 'Protected identity retained after audited identity correction.'
    end;
    insert into public.member_safeguarding_events(
      member_id,event_type,actor_id,reason,metadata
    ) values (
      p_member_id,'PROTECTED_IDENTIFIER_CAPTURED',v_actor,v_capture_reason,
      jsonb_build_object(
        'identifier_type',p_identifier_type,'normalized_value',v_value,'capture_source',p_capture_source
      )
    ) returning id into v_effective_event;
  end if;

  insert into public.member_protected_identifiers(
    member_id,identifier_type,normalized_value,capture_source,captured_by,safeguarding_event_id
  ) values (
    p_member_id,p_identifier_type,v_value,p_capture_source,v_actor,v_effective_event
  ) returning id into v_identifier_id;

  if p_capture_source<>'block_snapshot' and v_identifier_id is not null then
    insert into public.audit_log(
      actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
    ) values (
      'admin',v_actor,'PROTECTED_IDENTIFIER_CAPTURED','member_protected_identifier',v_identifier_id::text,
      null,
      jsonb_build_object(
        'member_id',p_member_id,'identifier_type',p_identifier_type,
        'normalized_value',v_value,'capture_source',p_capture_source,
        'safeguarding_event_id',v_effective_event
      ),v_capture_reason
    );
  end if;
end;
$$;

revoke all on function public.cm_protect_member_identifier(uuid,text,text,text,text,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.admin_block_member(
  p_member_id uuid,
  p_expected_version bigint,
  p_summary text,
  p_reason text,
  p_confirmed boolean,
  p_actor_id text
) returns table(
  member_id uuid,
  safeguarding_version bigint,
  is_blocked boolean,
  access_restoration_required boolean,
  event_id uuid,
  task_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.member_safeguarding_state%rowtype;
  v_summary text;
  v_reason text;
  v_actor text;
  v_status text;
  v_event uuid;
  v_task uuid;
  v_email text;
  v_before jsonb;
  v_after jsonb;
  v_needs_telegram_task boolean;
  v_account record;
begin
  v_summary:=btrim(coalesce(p_summary,''));
  v_reason:=btrim(coalesce(p_reason,''));
  v_actor:=coalesce(nullif(btrim(p_actor_id),''),'vip-admin');
  if p_member_id is null or p_expected_version is null
     or v_summary='' or char_length(v_summary)>200
     or v_reason='' or char_length(v_reason)>1000 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  if p_confirmed is distinct from true then
    raise exception using errcode='P0001', message='SAFEGUARDING_CONFIRMATION_REQUIRED';
  end if;

  select * into v_state
  from public.member_safeguarding_state s
  where s.member_id=p_member_id
  for update;
  if not found then
    raise exception using errcode='P0001', message='SAFEGUARDING_STATE_MISSING';
  end if;
  if v_state.version<>p_expected_version then
    raise exception using errcode='P0001', message='SAFEGUARDING_STALE_STATE';
  end if;
  if v_state.is_blocked then
    raise exception using errcode='P0001', message='MEMBER_ALREADY_BLOCKED';
  end if;

  select m.email into v_email from public.members m where m.id=p_member_id;
  if not found then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  select cms.status into v_status
  from public.current_member_status cms
  where cms.member_id=p_member_id
  limit 1;

  v_before:=to_jsonb(v_state);
  insert into public.member_safeguarding_events(
    member_id,event_type,actor_id,summary,reason,metadata
  ) values (
    p_member_id,'MEMBER_BLOCKED',v_actor,v_summary,v_reason,
    jsonb_build_object('membership_status',v_status,'expected_version',p_expected_version)
  ) returning id into v_event;

  perform public.cm_protect_member_identifier(
    p_member_id,'email',v_email,'block_snapshot',v_actor,v_event
  );
  for v_account in
    select ta.telegram_username,ta.telegram_user_id
    from public.telegram_accounts ta where ta.member_id=p_member_id
  loop
    perform public.cm_protect_member_identifier(
      p_member_id,'telegram_username',v_account.telegram_username,
      'block_snapshot',v_actor,v_event
    );
    if v_account.telegram_user_id is not null then
      perform public.cm_protect_member_identifier(
        p_member_id,'telegram_user_id',v_account.telegram_user_id::text,
        'block_snapshot',v_actor,v_event
      );
    end if;
  end loop;

  v_needs_telegram_task:=coalesce(v_status,'FORMER') in ('ACTIVE','LIFETIME')
    or exists (
      select 1 from public.telegram_accounts ta
      where ta.member_id=p_member_id
        and (ta.telegram_user_id is not null or ta.linked_at is not null or ta.dm_available=true)
    );

  if v_needs_telegram_task then
    insert into public.member_safeguarding_tasks(
      member_id,block_event_id,task_type,status,required_by
    ) values (
      p_member_id,v_event,'telegram_removal','OPEN',v_actor
    ) returning id into v_task;

    insert into public.member_safeguarding_events(
      member_id,event_type,actor_id,reason,metadata
    ) values (
      p_member_id,'TELEGRAM_REMOVAL_REQUIRED',v_actor,
      'Manual Telegram removal must be completed or explicitly confirmed unnecessary.',
      jsonb_build_object('task_id',v_task,'block_event_id',v_event,'membership_status',v_status)
    );
  end if;

  update public.member_safeguarding_state as s
  set is_blocked=true,
      ever_blocked=true,
      blocked_at=now(),
      blocked_by=v_actor,
      blocked_summary=v_summary,
      access_restoration_required=false,
      version=version+1,
      updated_at=now()
  where s.member_id=p_member_id
  returning s.version into safeguarding_version;

  select to_jsonb(s) into v_after
  from public.member_safeguarding_state s where s.member_id=p_member_id;

  if v_task is not null then
    insert into public.audit_log(
      actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
    ) values (
      'admin',v_actor,'TELEGRAM_REMOVAL_REQUIRED','member_safeguarding_task',v_task::text,
      null,
      jsonb_build_object('member_id',p_member_id,'block_event_id',v_event,'status','OPEN'),
      'Manual Telegram removal must be completed or explicitly confirmed unnecessary.'
    );
  end if;

  insert into public.audit_log(
    actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
  ) values (
    'admin',v_actor,'MEMBER_BLOCKED','member_safeguarding_state',p_member_id::text,
    v_before,
    v_after||jsonb_build_object('block_event_id',v_event,'telegram_removal_task_id',v_task),
    v_reason
  );

  member_id:=p_member_id;
  is_blocked:=true;
  access_restoration_required:=false;
  event_id:=v_event;
  task_id:=v_task;
  return next;
end;
$$;

revoke all on function public.admin_block_member(uuid,bigint,text,text,boolean,text)
  from public, anon, authenticated;
grant execute on function public.admin_block_member(uuid,bigint,text,text,boolean,text)
  to service_role;

create or replace function public.admin_unblock_member(
  p_member_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_acknowledged boolean,
  p_actor_id text
) returns table(
  member_id uuid,
  safeguarding_version bigint,
  is_blocked boolean,
  access_restoration_required boolean,
  event_id uuid,
  task_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.member_safeguarding_state%rowtype;
  v_reason text;
  v_actor text;
  v_status text;
  v_restore boolean;
  v_event uuid;
  v_before jsonb;
  v_after jsonb;
begin
  v_reason:=btrim(coalesce(p_reason,''));
  v_actor:=coalesce(nullif(btrim(p_actor_id),''),'vip-admin');
  if p_member_id is null or p_expected_version is null
     or v_reason='' or char_length(v_reason)>1000 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  if p_acknowledged is distinct from true then
    raise exception using errcode='P0001', message='SAFEGUARDING_CONFIRMATION_REQUIRED';
  end if;
  select * into v_state
  from public.member_safeguarding_state s
  where s.member_id=p_member_id
  for update;
  if not found then
    raise exception using errcode='P0001', message='SAFEGUARDING_STATE_MISSING';
  end if;
  if v_state.version<>p_expected_version then
    raise exception using errcode='P0001', message='SAFEGUARDING_STALE_STATE';
  end if;
  if not v_state.is_blocked then
    raise exception using errcode='P0001', message='MEMBER_NOT_BLOCKED';
  end if;

  select cms.status into v_status
  from public.current_member_status cms
  where cms.member_id=p_member_id
  limit 1;
  v_restore:=coalesce(v_status,'FORMER') in ('ACTIVE','LIFETIME');
  v_before:=to_jsonb(v_state);

  insert into public.member_safeguarding_events(
    member_id,event_type,actor_id,reason,metadata
  ) values (
    p_member_id,'MEMBER_UNBLOCKED',v_actor,v_reason,
    jsonb_build_object('membership_status',v_status,'access_restoration_required',v_restore)
  ) returning id into v_event;

  update public.member_safeguarding_state as s
  set is_blocked=false,
      blocked_at=null,
      blocked_by=null,
      blocked_summary=null,
      access_restoration_required=v_restore,
      last_unblocked_at=now(),
      last_unblocked_by=v_actor,
      version=version+1,
      updated_at=now()
  where s.member_id=p_member_id
  returning s.version into safeguarding_version;

  select to_jsonb(s) into v_after
  from public.member_safeguarding_state s where s.member_id=p_member_id;

  insert into public.audit_log(
    actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
  ) values (
    'admin',v_actor,'MEMBER_UNBLOCKED','member_safeguarding_state',p_member_id::text,
    v_before,v_after||jsonb_build_object('event_id',v_event),v_reason
  );

  member_id:=p_member_id;
  is_blocked:=false;
  access_restoration_required:=v_restore;
  event_id:=v_event;
  task_id:=null;
  return next;
end;
$$;

revoke all on function public.admin_unblock_member(uuid,bigint,text,boolean,text)
  from public, anon, authenticated;
grant execute on function public.admin_unblock_member(uuid,bigint,text,boolean,text)
  to service_role;

create or replace function public.admin_restore_member_access(
  p_member_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_confirmed boolean,
  p_actor_id text
) returns table(
  member_id uuid,
  safeguarding_version bigint,
  is_blocked boolean,
  access_restoration_required boolean,
  event_id uuid,
  task_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.member_safeguarding_state%rowtype;
  v_reason text;
  v_actor text;
  v_status text;
  v_event uuid;
  v_before jsonb;
  v_after jsonb;
begin
  v_reason:=btrim(coalesce(p_reason,''));
  v_actor:=coalesce(nullif(btrim(p_actor_id),''),'vip-admin');
  if p_member_id is null or p_expected_version is null
     or v_reason='' or char_length(v_reason)>1000 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;
  if p_confirmed is distinct from true then
    raise exception using errcode='P0001', message='SAFEGUARDING_CONFIRMATION_REQUIRED';
  end if;

  select * into v_state
  from public.member_safeguarding_state s
  where s.member_id=p_member_id
  for update;
  if not found then
    raise exception using errcode='P0001', message='SAFEGUARDING_STATE_MISSING';
  end if;
  if v_state.version<>p_expected_version then
    raise exception using errcode='P0001', message='SAFEGUARDING_STALE_STATE';
  end if;
  if v_state.is_blocked then
    raise exception using errcode='P0001', message='ACTION_BLOCKED_BY_SAFEGUARDING';
  end if;
  if not v_state.access_restoration_required then
    raise exception using errcode='P0001', message='ACCESS_RESTORATION_NOT_REQUIRED';
  end if;

  select cms.status into v_status
  from public.current_member_status cms
  where cms.member_id=p_member_id
  limit 1;
  if coalesce(v_status,'FORMER') not in ('ACTIVE','LIFETIME') then
    raise exception using errcode='P0001', message='ACCESS_RESTORATION_EXPIRED';
  end if;

  v_before:=to_jsonb(v_state);
  insert into public.member_safeguarding_events(
    member_id,event_type,actor_id,reason,metadata
  ) values (
    p_member_id,'MEMBER_ACCESS_RESTORED',v_actor,v_reason,
    jsonb_build_object('membership_status',v_status,'expected_version',p_expected_version)
  ) returning id into v_event;

  update public.member_safeguarding_state as s
  set access_restoration_required=false,
      version=version+1,
      updated_at=now()
  where s.member_id=p_member_id
  returning s.version into safeguarding_version;

  select to_jsonb(s) into v_after
  from public.member_safeguarding_state s where s.member_id=p_member_id;

  insert into public.audit_log(
    actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
  ) values (
    'admin',v_actor,'MEMBER_ACCESS_RESTORED','member_safeguarding_state',p_member_id::text,
    v_before,v_after||jsonb_build_object('event_id',v_event,'membership_status',v_status),v_reason
  );

  member_id:=p_member_id;
  is_blocked:=false;
  access_restoration_required:=false;
  event_id:=v_event;
  task_id:=null;
  return next;
end;
$$;

revoke all on function public.admin_restore_member_access(uuid,bigint,text,boolean,text)
  from public, anon, authenticated;
grant execute on function public.admin_restore_member_access(uuid,bigint,text,boolean,text)
  to service_role;

create or replace function public.admin_complete_safeguarding_task(
  p_member_id uuid,
  p_task_id uuid,
  p_outcome text,
  p_note text,
  p_actor_id text
) returns table(
  member_id uuid,
  safeguarding_task_id uuid,
  task_status text,
  task_outcome text,
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.member_safeguarding_tasks%rowtype;
  v_outcome text;
  v_note text;
  v_actor text;
  v_event_type text;
  v_event uuid;
  v_before jsonb;
  v_after jsonb;
begin
  v_outcome:=upper(btrim(coalesce(p_outcome,'')));
  v_note:=nullif(btrim(coalesce(p_note,'')),'');
  v_actor:=coalesce(nullif(btrim(p_actor_id),''),'vip-admin');
  if p_member_id is null or p_task_id is null
     or v_outcome not in ('REMOVED_FROM_TELEGRAM','CONFIRMED_NOT_PRESENT_OR_NO_ACCESS')
     or (v_note is not null and char_length(v_note)>1000) then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  select * into v_task
  from public.member_safeguarding_tasks t
  where t.id=p_task_id and t.member_id=p_member_id
  for update;
  if not found or v_task.status<>'OPEN' then
    raise exception using errcode='P0001', message='SAFEGUARDING_TASK_NOT_OPEN';
  end if;

  v_event_type:=case v_outcome
    when 'REMOVED_FROM_TELEGRAM' then 'TELEGRAM_REMOVAL_COMPLETED'
    else 'TELEGRAM_NO_ACCESS_CONFIRMED'
  end;
  v_before:=to_jsonb(v_task);

  update public.member_safeguarding_tasks
  set status='COMPLETED',outcome=v_outcome,completed_at=now(),completed_by=v_actor,
      completion_note=v_note
  where id=p_task_id;

  select to_jsonb(t) into v_after
  from public.member_safeguarding_tasks t where t.id=p_task_id;

  insert into public.member_safeguarding_events(
    member_id,event_type,actor_id,reason,metadata
  ) values (
    p_member_id,v_event_type,v_actor,v_note,
    jsonb_build_object(
      'task_id',p_task_id,'outcome',v_outcome,'block_event_id',v_task.block_event_id
    )
  ) returning id into v_event;

  insert into public.audit_log(
    actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
  ) values (
    'admin',v_actor,v_event_type,'member_safeguarding_task',p_task_id::text,
    v_before,v_after||jsonb_build_object('event_id',v_event),v_note
  );

  member_id:=p_member_id;
  safeguarding_task_id:=p_task_id;
  task_status:='COMPLETED';
  task_outcome:=v_outcome;
  event_id:=v_event;
  return next;
end;
$$;

revoke all on function public.admin_complete_safeguarding_task(uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_complete_safeguarding_task(uuid,uuid,text,text,text)
  to service_role;


-- Safeguarding-aware replacements of existing admin identity RPCs.
create or replace function public.admin_create_member(
  p_display_name text,
  p_email text,
  p_telegram_username text,
  p_entitlement_type text,
  p_start_date date,
  p_duration_value integer,
  p_duration_unit text,
  p_final_expiry date,
  p_expiry_override_reason text,
  p_reason text,
  p_amount numeric,
  p_currency text,
  p_payment_date date,
  p_tx_hash text,
  p_payment_note text,
  p_actor_id text
) returns table(
  member_id uuid,
  membership_period_id uuid,
  payment_id uuid,
  telegram_account_id uuid,
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
  v_email text;
  v_telegram_username text;
  v_entitlement_type text;
  v_duration_unit text;
  v_calculated_expiry date;
  v_expiry_overridden boolean;
  v_expiry_override_reason text;
  v_reason text;
  v_actor text;
  v_currency text;
  v_tx_hash text;
  v_payment_note text;
  v_member_id uuid;
  v_period_id uuid;
  v_payment_id uuid;
  v_telegram_account_id uuid;
  v_event_id uuid;
begin
  v_display_name := regexp_replace(btrim(coalesce(p_display_name, '')), '[[:space:]]+', ' ', 'g');
  if v_display_name = '' or char_length(v_display_name) > 200 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  if v_email is not null and (
    char_length(v_email) > 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_telegram_username := nullif(
    lower(regexp_replace(btrim(coalesce(p_telegram_username, '')), '^@', '')),
    ''
  );
  if v_telegram_username is not null and (
    char_length(v_telegram_username) < 5
    or char_length(v_telegram_username) > 32
    or v_telegram_username !~ '^[a-z0-9_]+$'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_entitlement_type := lower(btrim(coalesce(p_entitlement_type, '')));
  if v_entitlement_type not in ('paid', 'complimentary', 'trial') then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  if p_start_date is null or p_duration_value is null or p_duration_value <= 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_duration_unit := lower(btrim(coalesce(p_duration_unit, '')));
  if v_duration_unit not in ('days', 'months') then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_calculated_expiry := public.cm_add_membership_duration(
    p_start_date, p_duration_value, v_duration_unit
  );
  if p_final_expiry is null or p_final_expiry <= p_start_date then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  v_expiry_overridden := p_final_expiry <> v_calculated_expiry;
  v_expiry_override_reason := nullif(btrim(coalesce(p_expiry_override_reason, '')), '');
  if v_expiry_overridden then
    if v_expiry_override_reason is null or char_length(v_expiry_override_reason) > 500 then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
    end if;
  else
    v_expiry_override_reason := null;
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if v_reason = '' or char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  v_actor := coalesce(nullif(btrim(p_actor_id), ''), 'vip-admin');

  v_currency := nullif(upper(btrim(coalesce(p_currency, ''))), '');
  v_tx_hash := nullif(btrim(coalesce(p_tx_hash, '')), '');
  v_payment_note := nullif(btrim(coalesce(p_payment_note, '')), '');

  if v_entitlement_type = 'paid' then
    if p_amount is null or p_amount <= 0
       or v_currency is null
       or char_length(v_currency) > 12
       or v_currency !~ '^[A-Z0-9_-]+$'
       or (v_tx_hash is not null and char_length(v_tx_hash) > 300)
       or (v_payment_note is not null and char_length(v_payment_note) > 2000) then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
    end if;
  else
    if p_amount is not null
       or v_currency is not null
       or p_payment_date is not null
       or v_tx_hash is not null
       or v_payment_note is not null then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
    end if;
  end if;

  -- Serialize this low-volume admin operation so two concurrent creates cannot both
  -- pass the duplicate checks inside this RPC.
  perform pg_advisory_xact_lock(hashtext('cryptomainly_admin_create_member'));

  if v_email is not null and exists (
    select 1 from public.members m
    join public.member_safeguarding_state ss on ss.member_id=m.id
    where lower(btrim(coalesce(m.email,'')))=v_email and ss.is_blocked
  ) then raise exception using errcode='P0001', message='BLOCKED_MEMBER_MATCH'; end if;
  if v_email is not null and exists (
    select 1 from public.member_protected_identifiers i
    join public.member_safeguarding_state ss on ss.member_id=i.member_id
    where i.identifier_type='email' and i.normalized_value=v_email and ss.is_blocked
  ) then raise exception using errcode='P0001', message='BLOCKED_MEMBER_MATCH'; end if;
  if v_email is not null and exists (
    select 1 from public.member_protected_identifiers i
    where i.identifier_type='email' and i.normalized_value=v_email
  ) then raise exception using errcode='P0001', message='PROTECTED_MEMBER_MATCH'; end if;
  if v_email is not null and exists (
    select 1 from public.members m where lower(btrim(coalesce(m.email,'')))=v_email
  ) then raise exception using errcode='P0001', message='DUPLICATE_EMAIL'; end if;

  if v_telegram_username is not null and exists (
    select 1 from public.telegram_accounts ta
    join public.member_safeguarding_state ss on ss.member_id=ta.member_id
    where lower(regexp_replace(btrim(coalesce(ta.telegram_username,'')),'^@',''))=v_telegram_username
      and ss.is_blocked
  ) then raise exception using errcode='P0001', message='BLOCKED_MEMBER_MATCH'; end if;
  if v_telegram_username is not null and exists (
    select 1 from public.member_protected_identifiers i
    join public.member_safeguarding_state ss on ss.member_id=i.member_id
    where i.identifier_type='telegram_username' and i.normalized_value=v_telegram_username
      and ss.is_blocked
  ) then raise exception using errcode='P0001', message='BLOCKED_MEMBER_MATCH'; end if;
  if v_telegram_username is not null and exists (
    select 1 from public.member_protected_identifiers i
    where i.identifier_type='telegram_username' and i.normalized_value=v_telegram_username
  ) then raise exception using errcode='P0001', message='PROTECTED_MEMBER_MATCH'; end if;
  if v_telegram_username is not null and exists (
    select 1 from public.telegram_accounts ta
    where lower(regexp_replace(btrim(coalesce(ta.telegram_username,'')),'^@',''))=v_telegram_username
  ) then raise exception using errcode='P0001', message='DUPLICATE_TELEGRAM'; end if;

  if v_tx_hash is not null and exists (
    select 1 from public.payments p where p.tx_hash = v_tx_hash
  ) then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_TX_HASH';
  end if;

  insert into public.members (
    display_name, email, first_joined_on, marketing_status, source_system
  ) values (
    v_display_name, v_email, p_start_date, 'unknown', 'admin_manual'
  ) returning id into v_member_id;

  insert into public.membership_periods (
    member_id, entitlement_type, source, starts_on, expires_on,
    expiry_mode, removal_protected, migration_review, admin_note
  ) values (
    v_member_id, v_entitlement_type, 'phase2_admin_create', p_start_date, p_final_expiry,
    'fixed', false, false, v_reason
  ) returning id into v_period_id;

  if v_telegram_username is not null then
    insert into public.telegram_accounts (
      member_id, telegram_username, telegram_user_id, bot_started_at,
      linked_at, dm_available, last_verified_at
    ) values (
      v_member_id, v_telegram_username, null, null, null, false, null
    ) returning id into v_telegram_account_id;
  end if;

  if v_entitlement_type = 'paid' then
    begin
      insert into public.payments (
        member_id, membership_period_id, amount, currency, tx_hash,
        status, verification_method, received_at, verified_at, verified_by, notes
      ) values (
        v_member_id,
        v_period_id,
        p_amount,
        v_currency,
        v_tx_hash,
        'verified',
        'manual',
        case
          when p_payment_date is null then null
          else ((p_payment_date::timestamp + time '12:00') at time zone 'Europe/London')
        end,
        now(),
        v_actor,
        v_payment_note
      ) returning id into v_payment_id;
    exception when unique_violation then
      raise exception using errcode = 'P0001', message = 'DUPLICATE_TX_HASH';
    end;
  end if;

  insert into public.membership_events (
    member_id, membership_period_id, event_type, old_expiry, new_expiry,
    adjustment_value, adjustment_unit, reason, actor_type, actor_id, metadata
  ) values (
    v_member_id, v_period_id, 'MEMBER_CREATED', null, p_final_expiry,
    p_duration_value, v_duration_unit, v_reason, 'admin', v_actor,
    jsonb_build_object(
      'entitlement_type', v_entitlement_type,
      'start_date', p_start_date,
      'duration_value', p_duration_value,
      'duration_unit', v_duration_unit,
      'calculated_expiry', v_calculated_expiry,
      'final_expiry', p_final_expiry,
      'expiry_overridden', v_expiry_overridden,
      'expiry_override_reason', v_expiry_override_reason,
      'payment_id', v_payment_id,
      'amount', p_amount,
      'currency', v_currency,
      'payment_date', p_payment_date,
      'tx_hash', v_tx_hash,
      'telegram_account_id', v_telegram_account_id,
      'telegram_username', v_telegram_username,
      'telegram_linked', false
    )
  ) returning id into v_event_id;

  insert into public.audit_log (
    actor_type, actor_id, action, entity_type, entity_id,
    before_data, after_data, reason
  ) values (
    'admin', v_actor, 'MEMBER_CREATED', 'member', v_member_id::text,
    null,
    jsonb_build_object(
      'member_id', v_member_id,
      'membership_period_id', v_period_id,
      'payment_id', v_payment_id,
      'telegram_account_id', v_telegram_account_id,
      'display_name', v_display_name,
      'email', v_email,
      'telegram_username', v_telegram_username,
      'telegram_linked', false,
      'entitlement_type', v_entitlement_type,
      'start_date', p_start_date,
      'duration_value', p_duration_value,
      'duration_unit', v_duration_unit,
      'calculated_expiry', v_calculated_expiry,
      'final_expiry', p_final_expiry,
      'expiry_overridden', v_expiry_overridden,
      'expiry_override_reason', v_expiry_override_reason,
      'amount', p_amount,
      'currency', v_currency,
      'payment_date', p_payment_date,
      'tx_hash', v_tx_hash
    ),
    v_reason
  );

  return query select
    v_member_id,
    v_period_id,
    v_payment_id,
    v_telegram_account_id,
    v_event_id;
end;
$$;

create or replace function public.admin_update_member_details(
  p_member_id uuid,
  p_expected jsonb,
  p_proposed jsonb,
  p_reason text,
  p_actor_id text
) returns table(member_id uuid, event_id uuid)
language plpgsql
security definer
set search_path = ''
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
  v_ever_blocked boolean;
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
  select ss.ever_blocked into v_ever_blocked from public.member_safeguarding_state ss where ss.member_id=p_member_id;
  if not found then raise exception using errcode='P0001', message='SAFEGUARDING_STATE_MISSING'; end if;

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

  if v_ever_blocked and v_member.email is distinct from v_email then
    perform public.cm_protect_member_identifier(
      p_member_id,'email',v_member.email,'identity_correction',v_actor,null
    );
    perform public.cm_protect_member_identifier(
      p_member_id,'email',v_email,'identity_correction',v_actor,null
    );
  end if;

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
set search_path = ''
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
  v_ever_blocked boolean;
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
  select ss.ever_blocked into v_ever_blocked from public.member_safeguarding_state ss where ss.member_id=p_member_id;
  if not found then raise exception using errcode='P0001', message='SAFEGUARDING_STATE_MISSING'; end if;

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

  if v_ever_blocked and v_current is distinct from v_new then
    perform public.cm_protect_member_identifier(
      p_member_id,'telegram_username',v_current,'identity_correction',v_actor,null
    );
    perform public.cm_protect_member_identifier(
      p_member_id,'telegram_username',v_new,'identity_correction',v_actor,null
    );
  end if;

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


-- Safeguarding-aware replacements of Phase 2 relationship actions and period correction.
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
set search_path = ''
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

  if not exists (
    select 1 from public.member_safeguarding_state ss where ss.member_id=p_member_id
  ) then
    raise exception using errcode='P0001', message='SAFEGUARDING_STATE_MISSING';
  end if;
  if exists (
    select 1 from public.admin_member_relationship_policy rp
    where rp.member_id=p_member_id and rp.membership_action_allowed is not true
  ) then
    raise exception using errcode='P0001', message='ACTION_BLOCKED_BY_SAFEGUARDING';
  end if;

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
set search_path = ''
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

  if not exists (
    select 1 from public.member_safeguarding_state ss where ss.member_id=p_member_id
  ) then
    raise exception using errcode='P0001', message='SAFEGUARDING_STATE_MISSING';
  end if;
  if exists (
    select 1 from public.admin_member_relationship_policy rp
    where rp.member_id=p_member_id and rp.membership_action_allowed is not true
  ) then
    raise exception using errcode='P0001', message='ACTION_BLOCKED_BY_SAFEGUARDING';
  end if;

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
set search_path = ''
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

  if not exists (
    select 1 from public.member_safeguarding_state ss where ss.member_id=p_member_id
  ) then
    raise exception using errcode='P0001', message='SAFEGUARDING_STATE_MISSING';
  end if;
  if exists (
    select 1 from public.admin_member_relationship_policy rp
    where rp.member_id=p_member_id and rp.membership_action_allowed is not true
  ) then
    raise exception using errcode='P0001', message='ACTION_BLOCKED_BY_SAFEGUARDING';
  end if;

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
set search_path = ''
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

  if not exists (
    select 1 from public.member_safeguarding_state ss where ss.member_id=p_member_id
  ) then
    raise exception using errcode='P0001', message='SAFEGUARDING_STATE_MISSING';
  end if;
  if exists (
    select 1 from public.admin_member_relationship_policy rp
    where rp.member_id=p_member_id and rp.membership_action_allowed is not true
  ) then
    raise exception using errcode='P0001', message='ACTION_BLOCKED_BY_SAFEGUARDING';
  end if;

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
set search_path = ''
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
  v_safeguarding_state public.member_safeguarding_state%rowtype;
  v_status_before text;
  v_status_after text;
  v_safeguarding_event_id uuid;
  v_state_before jsonb;
  v_state_after jsonb;
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

  select ss.* into v_safeguarding_state
  from public.member_safeguarding_state ss
  where ss.member_id=p_member_id
  for update;
  if not found then raise exception using errcode='P0001', message='SAFEGUARDING_STATE_MISSING'; end if;
  v_state_before:=to_jsonb(v_safeguarding_state);
  select cms.status into v_status_before
  from public.current_member_status cms where cms.member_id=p_member_id limit 1;

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

  select cms.status into v_status_after
  from public.current_member_status cms where cms.member_id=p_member_id limit 1;

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

  if v_safeguarding_state.ever_blocked
     and not v_safeguarding_state.is_blocked
     and v_status_before='FORMER'
     and v_status_after in ('ACTIVE','LIFETIME') then
    update public.member_safeguarding_state ss
    set access_restoration_required=true,version=ss.version+1,updated_at=now()
    where ss.member_id=p_member_id
    returning to_jsonb(ss) into v_state_after;

    insert into public.member_safeguarding_events(
      member_id,event_type,actor_id,reason,metadata
    ) values (
      p_member_id,'ACCESS_RESTORATION_REQUIRED',v_actor,
      'Factual entitlement correction requires a separate Restore Access decision.',
      jsonb_build_object(
        'membership_period_id',p_period_id,
        'membership_correction_event_id',v_event_id,
        'before_status',v_status_before,'after_status',v_status_after
      )
    ) returning id into v_safeguarding_event_id;

    insert into public.audit_log(
      actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
    ) values (
      'admin',v_actor,'ACCESS_RESTORATION_REQUIRED','member_safeguarding_state',p_member_id::text,
      v_state_before,v_state_after,
      'Factual entitlement correction requires a separate Restore Access decision.'
    );
  end if;

  return query select p_period_id,v_event_id;
end;
$$;
