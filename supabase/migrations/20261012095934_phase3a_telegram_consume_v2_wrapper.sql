-- Phase 3A follow-up: route Telegram identity consumption through a hardened wrapper.
-- The original consume RPC remains in place for compatibility but is no longer executable by service_role.

create or replace function public.telegram_consume_identity_link_v2(
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
  v_member_id uuid;
  v_placeholder_id uuid;
  v_result record;
begin
  v_hash := lower(btrim(coalesce(p_token_hash,'')));

  if v_hash ~ '^[0-9a-f]{64}$' then
    perform pg_advisory_xact_lock(hashtext('cryptomainly_admin_create_member'));

    select t.member_id
      into v_member_id
    from public.telegram_link_tokens t
    where t.token_hash = v_hash
    limit 1;

    if v_member_id is not null
       and not exists (
         select 1
         from public.telegram_accounts ta
         where ta.member_id = v_member_id
       ) then
      insert into public.telegram_accounts as ta(member_id, dm_available)
      values (v_member_id, false)
      returning ta.id into v_placeholder_id;
    end if;
  end if;

  select *
    into v_result
  from public.telegram_consume_identity_link(
    p_token_hash,
    p_update_id,
    p_telegram_user_id,
    p_telegram_username
  );

  if v_placeholder_id is not null
     and v_result.result_code not in ('LINKED','ALREADY_LINKED_IDEMPOTENT') then
    delete from public.telegram_accounts ta
    where ta.id = v_placeholder_id
      and ta.telegram_user_id is null;
  end if;

  result_code := v_result.result_code;
  member_id := v_result.member_id;
  telegram_account_id := v_result.telegram_account_id;
  linked_at := v_result.linked_at;
  replayed := v_result.replayed;
  return next;
end;
$$;

revoke all on function public.telegram_consume_identity_link_v2(text,bigint,bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.telegram_consume_identity_link_v2(text,bigint,bigint,text)
  to service_role;

revoke execute on function public.telegram_consume_identity_link(text,bigint,bigint,text)
  from service_role;
