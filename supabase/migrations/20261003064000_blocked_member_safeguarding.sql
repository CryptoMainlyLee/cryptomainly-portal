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
begin
  if p_identifier_type not in ('email','telegram_username','telegram_user_id')
     or p_capture_source not in ('block_snapshot','identity_correction','telegram_verified')
     or p_member_id is null or p_event_id is null then
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

  begin
    insert into public.member_protected_identifiers(
      member_id,identifier_type,normalized_value,capture_source,captured_by,safeguarding_event_id
    ) values (
      p_member_id,p_identifier_type,v_value,p_capture_source,v_actor,p_event_id
    );
  exception when unique_violation then
    select i.member_id into v_owner
    from public.member_protected_identifiers i
    where i.identifier_type=p_identifier_type and i.normalized_value=v_value;
    if v_owner is distinct from p_member_id then
      raise exception using errcode='P0001', message='PROTECTED_IDENTITY_CONFLICT';
    end if;
  end;
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
