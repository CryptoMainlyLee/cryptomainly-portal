-- CryptoMainly Phase 2: preserve verified original relationship start dates
-- Source: CryptoMainly - 2023 / Copy of NFT / column B.
-- These dates are first-known relationship dates only and do not assert continuous membership.

with source_data(legacy_member_code, source_row, original_start_on) as (
  values
    ('CM-068'::text, 80, '2025-05-05'::date),
    ('CM-069', 81, '2022-04-18'::date),
    ('CM-070', 84, '2024-11-26'::date),
    ('CM-071', 87, '2022-06-02'::date),
    ('CM-072', 88, '2023-12-01'::date),
    ('CM-073', 89, '2022-04-22'::date),
    ('CM-074', 92, '2022-07-31'::date)
), eligible as (
  select
    m.id as member_id,
    m.legacy_member_code,
    s.source_row,
    s.original_start_on
  from source_data s
  join public.members m
    on m.legacy_member_code = s.legacy_member_code
  join public.current_member_status cms
    on cms.member_id = m.id
   and cms.status = 'ACTIVE'
   and cms.entitlement_type = 'paid'
  where m.first_joined_on = s.original_start_on
), inserted as (
  insert into public.membership_events (
    member_id,
    membership_period_id,
    event_type,
    occurred_at,
    reason,
    actor_type,
    actor_id,
    metadata
  )
  select
    e.member_id,
    null,
    'LEGACY_RELATIONSHIP_STARTED',
    ((e.original_start_on::timestamp + time '12:00') at time zone 'Europe/London'),
    'Original relationship start date preserved from legacy membership sheet; continuous membership is not asserted.',
    'migration',
    'phase2_membership_actions',
    jsonb_build_object(
      'source_workbook', 'CryptoMainly - 2023',
      'source_sheet', 'Copy of NFT',
      'source_column', 'B',
      'source_row', e.source_row,
      'original_relationship_start_on', e.original_start_on,
      'continuity_unknown', true
    )
  from eligible e
  where not exists (
    select 1
    from public.membership_events existing
    where existing.member_id = e.member_id
      and existing.event_type = 'LEGACY_RELATIONSHIP_STARTED'
      and existing.metadata->>'source_sheet' = 'Copy of NFT'
      and existing.metadata->>'source_column' = 'B'
      and (existing.metadata->>'source_row')::integer = e.source_row
  )
  returning member_id, metadata
)
insert into public.audit_log (
  actor_type,
  actor_id,
  action,
  entity_type,
  entity_id,
  before_data,
  after_data,
  reason
)
select
  'migration',
  'phase2_membership_actions',
  'LEGACY_RELATIONSHIP_START_BACKFILLED',
  'member',
  member_id::text,
  jsonb_build_object('legacy_relationship_start_event', null),
  metadata,
  'Added verified original relationship start date from legacy sheet column B; continuous membership is not asserted.'
from inserted;
