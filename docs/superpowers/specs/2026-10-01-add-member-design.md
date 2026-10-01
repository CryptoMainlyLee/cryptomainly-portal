# CryptoMainly Add Member — Design Spec

Date: 2026-10-01
Status: Approved 2026-10-01

## Purpose

Add a safe manual onboarding flow for a genuinely new VIP member who does not already exist in the CryptoMainly membership database.

The existing Phase 2 dashboard can renew, reactivate, extend and correct existing memberships, but it cannot create a brand-new person. This feature closes that gap without making Telegram bot linking a prerequisite.

## Scope

The first version supports these entitlement types only:
- Paid
- Complimentary
- Trial

Lifetime and Admin creation are intentionally excluded from this version because their no-expiry/protection semantics deserve separate design.

The Add Member control will appear on the same quick-action row as:
- Clear filters
- Active only
- Review queue

Selecting Add Member opens a dedicated `/admin/vip/new` page.

## Core principle

The expiry date remains the authority. The form calculates an expiry from start date plus duration, but the administrator may override the calculated expiry before saving.

If the final expiry differs from the calculated expiry, the administrator must provide a separate expiry-override reason. The calculated expiry, final expiry and override reason are preserved in the audit trail.

## Form flow

The page uses two stages: Enter Details, then Review Before Save.

### Enter Details

Identity fields:
- Display name — required
- Telegram username — optional
- Email — optional

Membership fields:
- Membership type — Paid, Complimentary or Trial
- Start date — required
- Duration — required
- Presets — 1, 3, 6 and 12 months
- Custom duration — positive whole-number days or months
- Calculated expiry — displayed automatically
- Manual expiry override — optional
- Expiry override reason — required only when final expiry differs from calculated expiry
- Membership/admin reason — required

Paid-only fields:
- Amount paid — required and greater than zero
- Currency — required, default USDT
- Payment date — optional
- Transaction hash — optional
- Payment note — optional

Complimentary and Trial creation must not create a payment row.

### Review Before Save

Before any database write, show a review summary containing:
- display name, email and Telegram username
- entitlement type
- start date and duration
- calculated expiry
- final authoritative expiry
- expiry override reason when applicable
- membership/admin reason
- paid payment summary when applicable
- Telegram state explicitly shown as Not linked until bot verification

The administrator must explicitly confirm creation from this review screen.

## Duplicate protection

Duplicate checking happens before final confirmation.

Hard-stop matches:
- exact normalized email match against an existing member
- exact normalized Telegram username match against an existing Telegram account

A hard stop must identify the existing member and provide a link to that member record instead of allowing a duplicate to be created.

A similar display-name match is a warning, not a hard stop. The administrator may continue only after explicitly acknowledging that the person is genuinely new.

For v1, display-name similarity is advisory and deterministic: trim whitespace, collapse repeated spaces, remove punctuation and compare case-insensitively. Warn on an exact normalized-name match, or when one normalized name fully contains the other and the shorter normalized name is at least 5 characters. Display names remain non-unique.

Duplicate comparison for hard stops is case-insensitive and must normalize obvious Telegram `@` formatting differences.

## Transaction and database design

Creation will use one dedicated server-side Supabase RPC so the operation is atomic.

Within one transaction it will create:
1. `members` row
2. initial `membership_periods` row
3. optional `payments` row for Paid only
4. optional `telegram_accounts` stub when a username is supplied
5. `membership_events` row with event type `MEMBER_CREATED`
6. one root `audit_log` row with action `MEMBER_CREATED`, entity type `member`, and `after_data` containing the created member/period/payment/Telegram identifiers plus the reviewed creation values

If any write fails, the whole transaction rolls back and no partial member is left behind.

The RPC returns the new member ID so the application can redirect directly to `/admin/vip/<new-member-id>` after successful creation.

### Member row

New members use `source_system = 'admin_manual'`; no legacy member code is required. `first_joined_on` is set to the selected membership start date. `marketing_status` remains `unknown` unless separately changed later.

### Membership period

The first period uses `source = 'phase2_admin_create'`, the selected entitlement type, selected start date and final authoritative expiry. The first version creates fixed-expiry periods only for Paid, Complimentary and Trial. The required membership/admin reason is stored as the period `admin_note` and is also used as the creation event/audit reason.

### Paid payment row

Paid creation records amount, currency, optional transaction hash, optional payment note and manual verification metadata. If payment date is blank, `received_at` remains NULL; the system must not invent a date.

### Telegram stub

If a Telegram username is supplied, create a `telegram_accounts` row immediately with:
- normalized username
- `telegram_user_id` NULL
- `linked_at` NULL
- `bot_started_at` NULL
- `dm_available` false
- `last_verified_at` NULL

The username is a mutable contact/reference value, not verified identity. Phase 3 will later attach a bot-verified numeric Telegram user ID to this same logical member/account record.

No numeric Telegram ID may be guessed or manually fabricated by this flow.

## Validation and safety

Server-side validation is authoritative even when the client has already validated the form.

Required protections:
- admin session required before duplicate checks or creation
- display name must be non-empty and length-bounded
- email, when present, must be normalized and valid enough for duplicate comparison/storage
- Telegram username, when present, must be normalized and length-bounded
- start date must be a valid ISO date
- duration must be a positive whole number of days or months
- final expiry must be a valid date after the start date
- override reason required if final expiry differs from calculated expiry
- membership/admin reason required and length-bounded
- Paid requires positive amount and valid currency
- Complimentary/Trial reject payment data rather than silently persisting it

The RPC must repeat duplicate checks inside the transaction immediately before insert so a stale browser review cannot create a duplicate after another admin action.

The new flow must not alter these system settings:
- `automatic_reminders_enabled`
- `automatic_removals_enabled`
- `campaign_sending_enabled`
- `payment_auto_activation_enabled`

No Telegram access changes, invites, removals or reinstatements are part of this feature.

## Audit semantics

The creation event and audit trail must preserve enough information to reconstruct what the administrator approved, including:
- entitlement type
- start date
- duration value/unit
- calculated expiry
- final expiry
- whether an override occurred
- override reason when applicable
- paid amount/currency/payment date when applicable
- Telegram username supplied at creation
- actor ID and administrator reason

The audit trail must not claim that an unverified Telegram username is bot-linked.

## Error handling

Expected validation/duplicate errors return safe application error codes rather than raw database details. The Add Member page should retain the entered values where practical and show a clear corrective message.

Unexpected Supabase/database failures must fail closed: no partial writes, no Telegram action, and no false success confirmation.

## Testing requirements

Implementation must use TDD for validation and creation logic. Minimum coverage:
- Paid member creation creates member, period, payment, event and audit records
- Complimentary creation creates no payment
- Trial creation creates no payment
- blank Paid payment date leaves `received_at` NULL
- duration calculation matches existing calendar-month rules
- manual expiry override is rejected without an override reason
- exact email duplicate is blocked
- exact Telegram username duplicate is blocked, including `@`/case normalization
- similar display name produces warning/acknowledgement path
- Telegram stub contains no numeric ID and remains unlinked
- failure during any write rolls back the complete transaction
- audit/event metadata reflects the reviewed values
- automation safety switches remain unchanged
- existing Phase 2 membership-action regression suite still passes
- production build succeeds

## Rollout

Implement and test first without changing any existing member record. Apply the database migration, verify the RPC with rollback-safe/synthetic test data, remove synthetic records, then deploy through Preview before Production.

After Production deployment, verify the Add Member page and duplicate-check path without creating a fake financial member. The first permanent Paid member created through this flow should preferably be a genuine new customer unless an explicit synthetic test is approved.

## Non-goals

This feature does not implement Telegram bot linking, Telegram access automation, automatic payment verification, campaigns, lifetime/admin onboarding, or changes to existing automation switches.

Those remain separate later phases.
