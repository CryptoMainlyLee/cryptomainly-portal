-- Phase 3A: verified Telegram identity linking only.
-- This migration never grants, removes or inspects Telegram group access.

create table public.telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  token_hash text not null,
  issued_at timestamptz not null default now(),
  issued_by text not null,
  issued_safeguarding_version bigint not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by text,
  revocation_reason text,
  consumed_at timestamptz,
  consumed_update_id bigint,
  created_at timestamptz not null default now(),
  constraint telegram_link_tokens_hash_unique unique (token_hash),
  constraint telegram_link_tokens_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint telegram_link_tokens_actor_check
    check (btrim(issued_by)<>'' and char_length(btrim(issued_by))<=200),
  constraint telegram_link_tokens_version_check check (issued_safeguarding_version>=0),
  constraint telegram_link_tokens_expiry_check check (expires_at>issued_at),
  constraint telegram_link_tokens_revoke_check check (
    (revoked_at is null and revoked_by is null and revocation_reason is null)
    or
    (revoked_at is not null and revoked_by is not null and revocation_reason is not null)
  ),
  constraint telegram_link_tokens_revoked_by_check
    check (revoked_by is null or (btrim(revoked_by)<>'' and char_length(btrim(revoked_by))<=200)),
  constraint telegram_link_tokens_revocation_reason_check
    check (revocation_reason is null or (btrim(revocation_reason)<>'' and char_length(btrim(revocation_reason))<=500)),
  constraint telegram_link_tokens_consume_check
    check ((consumed_at is null)=(consumed_update_id is null)),
  constraint telegram_link_tokens_update_id_check
    check (consumed_update_id is null or consumed_update_id>0),
  constraint telegram_link_tokens_terminal_check
    check (not (revoked_at is not null and consumed_at is not null))
);

create unique index telegram_link_tokens_one_unresolved_per_member_idx
  on public.telegram_link_tokens(member_id)
  where consumed_at is null and revoked_at is null;

create index telegram_link_tokens_member_time_idx
  on public.telegram_link_tokens(member_id, issued_at desc, id desc);

create unique index telegram_accounts_one_verified_per_member_idx
  on public.telegram_accounts(member_id)
  where telegram_user_id is not null;

alter table public.telegram_link_tokens enable row level security;

revoke all on table public.telegram_link_tokens
  from public, anon, authenticated, service_role;

create or replace function public.admin_get_telegram_link_status(
  p_member_id uuid
) returns table(
  token_id uuid,
  member_id uuid,
  issued_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.member_id, t.issued_at, t.expires_at
  from public.telegram_link_tokens t
  where t.member_id=p_member_id
    and t.consumed_at is null
    and t.revoked_at is null
  order by t.issued_at desc, t.id desc
  limit 1
$$;

revoke all on function public.admin_get_telegram_link_status(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_get_telegram_link_status(uuid)
  to service_role;

create or replace function public.cm_audit_telegram_link_rejection(
  p_token_id uuid,
  p_member_id uuid,
  p_result_code text,
  p_update_id bigint,
  p_telegram_user_id bigint
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log(
    actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
  ) values (
    'system','telegram-membership-bot','TELEGRAM_LINK_REJECTED',
    'telegram_link_token',p_token_id::text,null,
    jsonb_build_object(
      'member_id',p_member_id,
      'result_code',p_result_code,
      'telegram_update_id',p_update_id,
      'telegram_user_id',p_telegram_user_id
    ),
    'Telegram identity linking was rejected by an authoritative business rule.'
  );
end;
$$;

revoke all on function public.cm_audit_telegram_link_rejection(uuid,uuid,text,bigint,bigint)
  from public, anon, authenticated, service_role;

create or replace function public.admin_issue_telegram_link_token(
  p_member_id uuid,
  p_expected_safeguarding_version bigint,
  p_token_hash text,
  p_actor_id text
) returns table(
  token_id uuid,
  expires_at timestamptz,
  revoked_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.member_safeguarding_state%rowtype;
  v_status text;
  v_actor text;
  v_token_hash text;
  v_token_id uuid;
  v_expires_at timestamptz;
  v_revoked_count integer := 0;
  v_old_token record;
begin
  v_actor:=coalesce(nullif(btrim(p_actor_id),''),'vip-admin');
  v_token_hash:=lower(btrim(coalesce(p_token_hash,'')));

  if p_member_id is null
     or p_expected_safeguarding_version is null
     or v_token_hash !~ '^[0-9a-f]{64}$'
     or char_length(v_actor)>200 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  perform pg_advisory_xact_lock(hashtext('cryptomainly_admin_create_member'));

  select * into v_state
  from public.member_safeguarding_state s
  where s.member_id=p_member_id
  for update;

  if not found then
    raise exception using errcode='P0001', message='TELEGRAM_LINK_STATE_MISSING';
  end if;
  if v_state.version<>p_expected_safeguarding_version then
    raise exception using errcode='P0001', message='TELEGRAM_LINK_STALE_STATE';
  end if;
  if v_state.is_blocked then
    raise exception using errcode='P0001', message='TELEGRAM_LINK_MEMBER_BLOCKED';
  end if;

  select cms.status into v_status
  from public.current_member_status cms
  where cms.member_id=p_member_id
  limit 1;

  if coalesce(v_status,'FORMER') not in ('ACTIVE','LIFETIME') then
    raise exception using errcode='P0001', message='TELEGRAM_LINK_MEMBER_INELIGIBLE';
  end if;

  if exists(
    select 1 from public.telegram_accounts ta
    where ta.member_id=p_member_id and ta.telegram_user_id is not null
  ) then
    raise exception using errcode='P0001', message='TELEGRAM_LINK_ALREADY_VERIFIED';
  end if;

  for v_old_token in
    update public.telegram_link_tokens t
    set revoked_at=now(),
        revoked_by=v_actor,
        revocation_reason='Replaced by a newly issued Telegram linking credential.'
    where t.member_id=p_member_id
      and t.consumed_at is null
      and t.revoked_at is null
    returning t.id,t.issued_at,t.expires_at
  loop
    v_revoked_count:=v_revoked_count+1;
    insert into public.audit_log(
      actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
    ) values (
      'admin',v_actor,'TELEGRAM_LINK_TOKEN_REVOKED','telegram_link_token',v_old_token.id::text,
      jsonb_build_object(
        'member_id',p_member_id,'issued_at',v_old_token.issued_at,'expires_at',v_old_token.expires_at
      ),
      jsonb_build_object('member_id',p_member_id,'revoked',true),
      'Replaced by a newly issued Telegram linking credential.'
    );
  end loop;

  v_expires_at:=now()+interval '24 hours';

  insert into public.telegram_link_tokens(
    member_id,token_hash,issued_by,issued_safeguarding_version,expires_at
  ) values (
    p_member_id,v_token_hash,v_actor,v_state.version,v_expires_at
  ) returning id into v_token_id;

  insert into public.audit_log(
    actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
  ) values (
    'admin',v_actor,'TELEGRAM_LINK_TOKEN_ISSUED','telegram_link_token',v_token_id::text,
    null,
    jsonb_build_object(
      'member_id',p_member_id,
      'issued_safeguarding_version',v_state.version,
      'expires_at',v_expires_at
    ),
    'Single-use Telegram identity linking credential issued.'
  );

  token_id:=v_token_id;
  expires_at:=v_expires_at;
  revoked_count:=v_revoked_count;
  return next;
end;
$$;

revoke all on function public.admin_issue_telegram_link_token(uuid,bigint,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_issue_telegram_link_token(uuid,bigint,text,text)
  to service_role;

create or replace function public.revoke_telegram_link_tokens_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_token record;
begin
  if old.is_blocked = false and new.is_blocked = true then
    v_actor:=coalesce(nullif(btrim(new.blocked_by),''),'vip-admin');
    for v_token in
      update public.telegram_link_tokens t
      set revoked_at=now(),
          revoked_by=v_actor,
          revocation_reason='Member became Blocked.'
      where t.member_id=new.member_id
        and t.consumed_at is null
        and t.revoked_at is null
      returning t.id,t.issued_at,t.expires_at
    loop
      insert into public.audit_log(
        actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
      ) values (
        'admin',v_actor,'TELEGRAM_LINK_TOKEN_REVOKED','telegram_link_token',v_token.id::text,
        jsonb_build_object(
          'member_id',new.member_id,'issued_at',v_token.issued_at,'expires_at',v_token.expires_at
        ),
        jsonb_build_object('member_id',new.member_id,'revoked',true,'cause','member_blocked'),
        'Pending Telegram linking credential revoked because the member became Blocked.'
      );
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function public.revoke_telegram_link_tokens_on_block()
  from public, anon, authenticated, service_role;

drop trigger if exists member_safeguarding_revoke_telegram_link_tokens
  on public.member_safeguarding_state;
create trigger member_safeguarding_revoke_telegram_link_tokens
after update of is_blocked on public.member_safeguarding_state
for each row execute function public.revoke_telegram_link_tokens_on_block();

create or replace function public.telegram_consume_identity_link(
  p_token_hash text,
  p_update_id bigint,
  p_telegram_user_id bigint,
  p_telegram_username text
) returns table(
  result_code text,
  member_id uuid,
  telegram_account_id uuid,
  linked_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_username text;
  v_token public.telegram_link_tokens%rowtype;
  v_state public.member_safeguarding_state%rowtype;
  v_status text;
  v_account public.telegram_accounts%rowtype;
  v_account_count integer;
  v_account_id uuid;
  v_linked_at timestamptz;
  v_owner uuid;
  v_after jsonb;
begin
  v_hash:=lower(btrim(coalesce(p_token_hash,'')));
  v_username:=nullif(lower(regexp_replace(btrim(coalesce(p_telegram_username,'')),'^@','')),'');

  if v_hash !~ '^[0-9a-f]{64}$' then
    result_code:='TOKEN_INVALID';
    member_id:=null;
    telegram_account_id:=null;
    linked_at:=null;
    replayed:=false;
    return next;
    return;
  end if;

  if p_update_id is null or p_update_id<=0
     or p_telegram_user_id is null or p_telegram_user_id<=0 then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  if v_username is not null and (
    char_length(v_username)<5 or char_length(v_username)>32 or v_username !~ '^[a-z0-9_]+$'
  ) then
    raise exception using errcode='P0001', message='INVALID_INPUT';
  end if;

  select * into v_token
  from public.telegram_link_tokens t
  where t.token_hash=v_hash;

  if not found then
    result_code:='TOKEN_INVALID';
    member_id:=null;
    telegram_account_id:=null;
    linked_at:=null;
    replayed:=false;
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('cryptomainly_admin_create_member'));

  select * into v_state
  from public.member_safeguarding_state s
  where s.member_id=v_token.member_id
  for update;

  if not found then
    perform public.cm_audit_telegram_link_rejection(
      v_token.id,v_token.member_id,'SAFEGUARDING_STATE_MISSING',p_update_id,p_telegram_user_id
    );
    result_code:='SAFEGUARDING_STATE_MISSING';
    member_id:=v_token.member_id;
    telegram_account_id:=null;
    linked_at:=null;
    replayed:=false;
    return next;
    return;
  end if;

  select * into v_token
  from public.telegram_link_tokens t
  where t.id=v_token.id
  for update;

  if v_token.consumed_at is not null then
    if v_token.consumed_update_id=p_update_id then
      select ta.id,ta.linked_at into v_account_id,v_linked_at
      from public.telegram_accounts ta
      where ta.member_id=v_token.member_id
        and ta.telegram_user_id=p_telegram_user_id
      order by ta.created_at asc,ta.id asc
      limit 1;
      if v_account_id is not null then
        result_code:='ALREADY_LINKED_IDEMPOTENT';
        member_id:=v_token.member_id;
        telegram_account_id:=v_account_id;
        linked_at:=v_linked_at;
        replayed:=true;
        return next;
        return;
      end if;
    end if;
    result_code:='TOKEN_CONSUMED';
    member_id:=v_token.member_id;
    telegram_account_id:=null;
    linked_at:=null;
    replayed:=false;
    return next;
    return;
  end if;

  if v_token.revoked_at is not null then
    result_code:='TOKEN_REVOKED';
    member_id:=v_token.member_id;
    telegram_account_id:=null;
    linked_at:=null;
    replayed:=false;
    return next;
    return;
  end if;

  if v_token.expires_at<=now() then
    result_code:='TOKEN_EXPIRED';
    member_id:=v_token.member_id;
    telegram_account_id:=null;
    linked_at:=null;
    replayed:=false;
    return next;
    return;
  end if;

  if v_state.is_blocked then
    perform public.cm_audit_telegram_link_rejection(
      v_token.id,v_token.member_id,'MEMBER_BLOCKED',p_update_id,p_telegram_user_id
    );
    result_code:='MEMBER_BLOCKED';
    member_id:=v_token.member_id;
    telegram_account_id:=null;
    linked_at:=null;
    replayed:=false;
    return next;
    return;
  end if;

  select cms.status into v_status
  from public.current_member_status cms
  where cms.member_id=v_token.member_id
  limit 1;

  if coalesce(v_status,'FORMER') not in ('ACTIVE','LIFETIME') then
    perform public.cm_audit_telegram_link_rejection(
      v_token.id,v_token.member_id,'MEMBER_INELIGIBLE',p_update_id,p_telegram_user_id
    );
    result_code:='MEMBER_INELIGIBLE';
    member_id:=v_token.member_id;
    telegram_account_id:=null;
    linked_at:=null;
    replayed:=false;
    return next;
    return;
  end if;

  select count(*) into v_account_count
  from public.telegram_accounts ta
  where ta.member_id=v_token.member_id;

  if v_account_count>1 then
    perform public.cm_audit_telegram_link_rejection(
      v_token.id,v_token.member_id,'TELEGRAM_ACCOUNT_AMBIGUOUS',p_update_id,p_telegram_user_id
    );
    result_code:='TELEGRAM_ACCOUNT_AMBIGUOUS';
    member_id:=v_token.member_id;
    telegram_account_id:=null;
    linked_at:=null;
    replayed:=false;
    return next;
    return;
  end if;

  if v_account_count=1 then
    select * into v_account
    from public.telegram_accounts ta
    where ta.member_id=v_token.member_id
    for update;

    if v_account.telegram_user_id is not null
       and v_account.telegram_user_id<>p_telegram_user_id then
      perform public.cm_audit_telegram_link_rejection(
        v_token.id,v_token.member_id,'MEMBER_HAS_DIFFERENT_TELEGRAM_ID',p_update_id,p_telegram_user_id
      );
      result_code:='MEMBER_HAS_DIFFERENT_TELEGRAM_ID';
      member_id:=v_token.member_id;
      telegram_account_id:=v_account.id;
      linked_at:=v_account.linked_at;
      replayed:=false;
      return next;
      return;
    end if;
  end if;

  if exists(
    select 1 from public.telegram_accounts ta
    where ta.member_id<>v_token.member_id
      and ta.telegram_user_id=p_telegram_user_id
  ) then
    perform public.cm_audit_telegram_link_rejection(
      v_token.id,v_token.member_id,'TELEGRAM_ID_OWNED',p_update_id,p_telegram_user_id
    );
    result_code:='TELEGRAM_ID_OWNED';
    member_id:=v_token.member_id;
    telegram_account_id:=null;
    linked_at:=null;
    replayed:=false;
    return next;
    return;
  end if;

  if v_username is not null and exists(
    select 1 from public.telegram_accounts ta
    where ta.member_id<>v_token.member_id
      and nullif(lower(regexp_replace(btrim(coalesce(ta.telegram_username,'')),'^@','')),'')=v_username
  ) then
    perform public.cm_audit_telegram_link_rejection(
      v_token.id,v_token.member_id,'TELEGRAM_USERNAME_CONFLICT',p_update_id,p_telegram_user_id
    );
    result_code:='TELEGRAM_USERNAME_CONFLICT';
    member_id:=v_token.member_id;
    telegram_account_id:=null;
    linked_at:=null;
    replayed:=false;
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('telegram_user_id:'||p_telegram_user_id::text));
  if v_username is not null then
    perform pg_advisory_xact_lock(hashtext('telegram_username:'||v_username));
  end if;

  select i.member_id into v_owner
  from public.member_protected_identifiers i
  where i.identifier_type='telegram_user_id'
    and i.normalized_value=p_telegram_user_id::text
  for update;

  if v_owner is not null and v_owner<>v_token.member_id then
    perform public.cm_audit_telegram_link_rejection(
      v_token.id,v_token.member_id,'PROTECTED_IDENTIFIER_CONFLICT',p_update_id,p_telegram_user_id
    );
    result_code:='PROTECTED_IDENTIFIER_CONFLICT';
    member_id:=v_token.member_id;
    telegram_account_id:=null;
    linked_at:=null;
    replayed:=false;
    return next;
    return;
  end if;

  v_owner:=null;
  if v_username is not null then
    select i.member_id into v_owner
    from public.member_protected_identifiers i
    where i.identifier_type='telegram_username'
      and i.normalized_value=v_username
    for update;

    if v_owner is not null and v_owner<>v_token.member_id then
      perform public.cm_audit_telegram_link_rejection(
        v_token.id,v_token.member_id,'PROTECTED_IDENTIFIER_CONFLICT',p_update_id,p_telegram_user_id
      );
      result_code:='PROTECTED_IDENTIFIER_CONFLICT';
      member_id:=v_token.member_id;
      telegram_account_id:=null;
      linked_at:=null;
      replayed:=false;
      return next;
      return;
    end if;
  end if;

  if v_state.ever_blocked then
    begin
      perform public.cm_protect_member_identifier(
        v_token.member_id,'telegram_user_id',p_telegram_user_id::text,
        'telegram_verified','telegram-membership-bot',null
      );
      if v_username is not null then
        perform public.cm_protect_member_identifier(
          v_token.member_id,'telegram_username',v_username,
          'telegram_verified','telegram-membership-bot',null
        );
      end if;
    exception when sqlstate 'P0001' then
      if sqlerrm='PROTECTED_IDENTITY_CONFLICT' then
        perform public.cm_audit_telegram_link_rejection(
          v_token.id,v_token.member_id,'PROTECTED_IDENTIFIER_CONFLICT',p_update_id,p_telegram_user_id
        );
        result_code:='PROTECTED_IDENTIFIER_CONFLICT';
        member_id:=v_token.member_id;
        telegram_account_id:=null;
        linked_at:=null;
        replayed:=false;
        return next;
        return;
      end if;
      raise;
    end;
  end if;

  if v_account_count=0 then
    insert into public.telegram_accounts(
      member_id,telegram_user_id,telegram_username,telegram_raw,
      bot_started_at,linked_at,dm_available,last_verified_at
    ) values (
      v_token.member_id,p_telegram_user_id,v_username,null,
      now(),now(),true,now()
    ) returning id,linked_at into v_account_id,v_linked_at;
  else
    update public.telegram_accounts ta
    set telegram_user_id=p_telegram_user_id,
        telegram_username=v_username,
        bot_started_at=coalesce(ta.bot_started_at,now()),
        linked_at=coalesce(ta.linked_at,now()),
        dm_available=true,
        last_verified_at=now()
    where ta.id=v_account.id
    returning ta.id,ta.linked_at into v_account_id,v_linked_at;
  end if;

  update public.telegram_link_tokens t
  set consumed_at=now(),
      consumed_update_id=p_update_id
  where t.id=v_token.id;

  select to_jsonb(ta) into v_after
  from public.telegram_accounts ta
  where ta.id=v_account_id;

  insert into public.audit_log(
    actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,reason
  ) values (
    'system','telegram-membership-bot','TELEGRAM_IDENTITY_LINKED',
    'telegram_account',v_account_id::text,
    case when v_account_count=1 then to_jsonb(v_account) else null end,
    v_after||jsonb_build_object(
      'token_id',v_token.id,
      'telegram_update_id',p_update_id,
      'vip_group_access_changed',false
    ),
    'Telegram numeric identity verified through a single-use Membership bot link.'
  );

  result_code:='LINKED';
  member_id:=v_token.member_id;
  telegram_account_id:=v_account_id;
  linked_at:=v_linked_at;
  replayed:=false;
  return next;
end;
$$;

revoke all on function public.telegram_consume_identity_link(text,bigint,bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.telegram_consume_identity_link(text,bigint,bigint,text)
  to service_role;
