-- CryptoMainly Add Member.
-- Creates a genuinely new member, initial entitlement and related audit records atomically.
-- The final expiry date is authoritative; calculated expiry is retained for audit.

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
set search_path = public
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
    select 1
    from public.members m
    where lower(btrim(coalesce(m.email, ''))) = v_email
  ) then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_EMAIL';
  end if;

  if v_telegram_username is not null and exists (
    select 1
    from public.telegram_accounts ta
    where lower(regexp_replace(btrim(coalesce(ta.telegram_username, '')), '^@', '')) = v_telegram_username
  ) then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_TELEGRAM';
  end if;

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

revoke all on function public.admin_create_member(
  text, text, text, text, date, integer, text, date,
  text, text, numeric, text, date, text, text, text
) from public;
revoke all on function public.admin_create_member(
  text, text, text, text, date, integer, text, date,
  text, text, numeric, text, date, text, text, text
) from anon;
revoke all on function public.admin_create_member(
  text, text, text, text, date, integer, text, date,
  text, text, numeric, text, date, text, text, text
) from authenticated;
grant execute on function public.admin_create_member(
  text, text, text, text, date, integer, text, date,
  text, text, numeric, text, date, text, text, text
) to service_role;
