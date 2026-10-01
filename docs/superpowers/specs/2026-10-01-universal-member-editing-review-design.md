# CryptoMainly Universal Member Editing & Review Resolution — Design Spec

Date: 2026-10-01
Status: Draft for user review

## Purpose

Turn the VIP membership database into a safely maintainable operational record for both legacy and newly-created members.

The system must allow an administrator to correct legitimate member, membership, Telegram-username and payment data without allowing silent history rewrites, identifier corruption or accidental automation side effects.

The existing legacy Review queue must become a deliberate data-quality workflow rather than a migration-only boolean. Every currently flagged record must be reviewed individually, corrected where evidence supports a correction, and explicitly accepted where historical detail is genuinely unknowable.

## Core principles

1. Operational data may be corrected; provenance and audit history are append-only.
2. System-generated identifiers are immutable.
3. Telegram username is editable contact data; Telegram numeric user ID is verified identity and is read-only in admin editing.
4. Every structural correction must be attributable and auditable.
5. Unknown historical facts remain unknown; the system must never force invented dates or payment facts.
6. Review status is reusable for future discrepancies, not only legacy migration cleanup.
7. Membership expiry remains authoritative for entitlement status.
8. Editing does not trigger Telegram access, reminders, campaigns or payment automation.

## Scope

The member detail page remains the central administration surface. It gains focused editing controls for:
- Identity & contact
- Current membership
- Historical membership periods
- Telegram username
- Payments
- Review status

Newly-created and legacy members use the same editing model after creation.

The Review queue becomes a list of members with an open review case. Existing migration-review records are seeded into this workflow without being auto-resolved.

The existing dashboard quick-action order is:
- Add Member
- Clear filters
- Active only
- Review queue

## Editable member data

Editable member-level fields:
- display name
- email
- first joined date
- admin/member notes
- marketing status

Editable membership-period fields:
- entitlement type
- plan name
- start date
- expiry date
- expiry mode
- removal protection
- protection reason
- ended-early date
- editable membership/admin note

Editable payment fields:
- amount
- currency
- network
- transaction hash
- status
- received date/time where known
- payment notes

Telegram username is editable and remains unverified contact/reference data until bot verification links a numeric Telegram user ID.

Changing operational data must never rewrite preserved legacy evidence fields.

Editable controlled-value fields must stay within the live database constraints:
- marketing status: `unknown`, `allowed`, `opted_out`
- entitlement type: `paid`, `complimentary`, `trial`, `lifetime`, `admin`
- expiry mode: `fixed`, `lifetime`, `manual_no_expiry`
- payment status: `pending`, `verified`, `rejected`, `refunded`

`payments.verification_method` remains system/provenance metadata and is not part of manual editing.

## Protected and immutable data

The admin UI must never allow direct editing of:
- `members.id`
- membership-period IDs
- payment IDs
- Telegram-account IDs
- Telegram numeric user ID
- legacy member code
- source-system/source fields
- legacy source-row references
- preserved legacy/raw notes
- database created/updated timestamps
- bot-started, linked and last-verified timestamps
- DM-available state
- verification actor/timestamps
- existing membership events
- existing audit-log records

Telegram numeric ID, bot-linking fields and DM capability are owned by the future Telegram-linking workflow, not manual member editing.

Existing audit/events are append-only. Corrections create new records describing the correction; they do not mutate prior history.

## Editing interaction

Each editable section saves independently. Do not use one giant record-wide update form.

Every meaningful edit follows:

**Edit → Preview changes → Confirm → Save**

The preview shows only changed values as before/after pairs. Structural/history-sensitive changes require a mandatory reason before confirmation.

A reason is mandatory for changes to:
- first joined date
- entitlement type
- membership start/expiry dates
- expiry mode
- removal protection
- historical membership data
- payment amount/status/date/transaction hash
- Review opening or resolution

Minor contact corrections such as display-name, email or Telegram-username cleanup remain audited. The implementation may use a lighter reason requirement for these, but the before/after change must still be recorded.

The server rereads the authoritative row immediately before write. If the reviewed version is stale, the save is rejected and the administrator must review the current data again.

## Server-side update boundaries

Use narrowly-scoped SECURITY DEFINER RPCs rather than a generic arbitrary-column update endpoint.

The design expects separate responsibilities for:
- member identity/contact updates
- membership-period corrections
- payment corrections
- Telegram-username updates
- opening a Review case
- resolving a Review case

Each RPC must:
- require the intended member/entity identifiers
- receive the values the administrator reviewed as stale-write guards where applicable
- validate the complete proposed state server-side
- write the operational change and audit/event records in one transaction
- return safe application error codes for expected conflicts
- roll back the entire change on failure
- be executable only through the service-role-backed admin server boundary

No browser/client code receives service-role credentials.

## Duplicate and consistency protection

Changing email or Telegram username repeats normalized duplicate checks against all other members/accounts. An exact normalized duplicate is a hard stop and identifies the conflicting member in the UI.

Telegram username normalization follows the Add Member rules so case and leading `@` formatting cannot bypass duplicate detection.

Transaction hashes remain unique when present. Payment correction must reject a transaction hash already attached to another payment.

Membership-period edits must prevent accidental overlap with another entitlement period for the same member. Any future exception for intentional overlap requires its own explicit workflow; v1 does not silently allow it.

Changing a payment does not automatically alter membership dates or entitlement status. Membership data remains authoritative.

A blank unknown historical payment date remains NULL; the system must not invent a date.

## Review-case model

Add a dedicated `member_review_cases` model instead of using `membership_periods.migration_review` as the permanent workflow mechanism.

A review case records at minimum:
- immutable case ID
- member ID
- optional membership-period ID
- optional payment ID
- origin (`legacy_migration`, `manual`, or `add_member`)
- category
- required opening reason
- open/resolved status
- opened at/by
- resolution outcome
- resolution note
- resolved at/by
- immutable created timestamp

The database must prevent duplicate simultaneous open cases for the same member, linked entity and category, while still allowing different legitimate open issues for one member. Resolved cases remain historical and must never be overwritten when a member is later put back into Review.

The dashboard Review queue means the member has at least one open review case; if multiple cases are open, the dashboard still shows the member once and the detail page lists every open case.

Review categories should support at least:
- Identity/contact
- Membership dates/entitlement
- Payment
- Telegram
- Historical data
- Other data discrepancy

Manually marking a clear member **In Review** requires both a category and a non-empty reason.

Resolving a Review case requires a resolution outcome and a short resolution note.

Supported resolution outcomes:
- `CORRECTED_DATA_UPDATED` — reviewed and operational data was corrected
- `EXISTING_DATA_CONFIRMED` — reviewed and current structured data was confirmed
- `HISTORICAL_DETAIL_UNKNOWN_ACCEPTED` — reviewed, remaining historical detail cannot be established reliably and is explicitly accepted as unknown

The UI labels the third outcome as **Reviewed — historical detail unknown/accepted**.

Resolving a case produces a permanent Review-resolution event/audit record. If a discrepancy is discovered later, opening a new case makes the member reappear in the queue without changing previous resolved cases.

## Legacy migration-review transition

As of the 2026-10-01 design snapshot, production contains 25 members in the dashboard Review queue, plus one separate historical Blackwolf membership period carrying `migration_review=true`. Before seeding review cases, rollout must re-query the live flags and reconcile any difference rather than assuming this count is still current.

The migration to review cases must seed one open `legacy_migration` Review case for each live membership period carrying `migration_review=true`, linking the case to that exact period, without clearing any legacy flag or changing any entitlement. The dashboard then deduplicates those cases to member rows.

Where the reason can be derived safely, seed a useful opening reason such as:
- missing membership start date
- contradictory historical dates
- protected indefinite complimentary access requiring confirmation
- historical payment/membership classification uncertainty

If a precise reason cannot be derived automatically, use a neutral legacy-review reason rather than inventing facts.

The fact that a period originally carried `migration_review=true` is preserved through its seeded Review case and audit history. The boolean itself is transitional workflow state and may be cleared only when that linked `legacy_migration` case is resolved; resolving one case must not clear any other period's flag.

The migration must not bulk-resolve, bulk-correct or otherwise rewrite any live record carrying a migration-review flag at migration time.

## Current Review reconciliation

The 25 dashboard Review members are a finite manual reconciliation checklist:
- 17 former members, largely with missing/ambiguous historical entitlement data
- 7 active protected complimentary/no-expiry members requiring confirmation
- 1 active paid member, Taap270, whose current structured start date requires careful reconciliation

Blackwolf's separate historical flagged period is reviewed independently and must not alter his clean current entitlement unless evidence separately requires a current-entitlement correction.

Each record is reviewed individually. Bulk clearing is prohibited.

For each Review member, the detail page must show:
- current structured values
- preserved legacy/source evidence
- open Review reason/category
- automatically detected concerns where reliable
- editable corrections
- Preview of proposed changes
- resolution outcome and note

If a historical fact cannot be established reliably, it remains NULL/unknown and may be resolved with `HISTORICAL_DETAIL_UNKNOWN_ACCEPTED`.

The seven protected complimentary members may be resolved without inventing start/expiry dates if the administrator confirms indefinite complimentary access is intentional. Their protection must remain explicit and reasoned.

Taap270 should be treated as a high-care active paid reconciliation before his Review case is resolved.

## Review dashboard

The Review queue should show at minimum:
- member
- current ACTIVE/FORMER/LIFETIME status
- entitlement type
- Review category
- Review reason
- opened date
- a clear Review action

Useful filters may include All, Active, Former, Missing dates, Complimentary and Paid. Scoring/automatic prioritisation is intentionally excluded from v1.

## Audit semantics

Every edit writes an append-only audit record with:
- entity type and ID
- actor
- reason where required
- reviewed before values
- confirmed after values
- timestamp
- linkage to the member

Membership-structure changes should also create a membership event with a specific event type describing the correction/review action.

Expected event/action families include member details updated, Telegram username updated, membership period corrected, payment corrected, Review opened and Review resolved.

Audit records must describe what actually changed. They must not imply bot verification, payment verification or historical certainty that did not occur.

The original source evidence remains separately readable after a structured correction.

## Add Member integration

Add Member remains the creation workflow. After creation, the new record uses this same universal editing model.

Add Member may gain an optional **Mark this member In Review** choice. When selected, a Review category and reason are required and the open Review case is created atomically with the member.

Normal Add Member creation continues to default to clear/not-in-review.

## Automation isolation

Universal editing and Review resolution must not directly:
- invite or remove Telegram users
- alter Telegram numeric user IDs
- send Telegram messages
- send membership reminders
- send campaigns
- auto-activate payments
- enable disabled automation switches

These system settings must remain unchanged by all editing/review RPCs:
- `automatic_reminders_enabled`
- `automatic_removals_enabled`
- `campaign_sending_enabled`
- `payment_auto_activation_enabled`

Corrected membership data may naturally change calculated dashboard status because expiry remains authoritative; that is data correction, not an automation side effect.

## Error handling

Expected validation, duplicate, overlap and stale-preview failures return safe application error codes rather than raw database errors.

Unexpected failures fail closed: no partial operational write, no partial Review resolution and no false success banner.

The UI should retain proposed edits where practical after a correctable validation failure.

## Testing requirements

Implementation must use TDD. Minimum pure/application coverage:
- editable/protected field rules are enforced
- before/after preview contains only changed values
- structural edits require a reason
- normalized email duplicate is blocked
- normalized Telegram username duplicate is blocked
- Telegram numeric ID cannot be changed through admin editing
- Review opening requires category and reason
- Review resolution requires outcome and note
- historical-unknown acceptance permits unresolved facts to remain NULL
- reopening Review creates a new case rather than overwriting history

Minimum rollback-safe database coverage:
- member identity/contact correction is atomic and audited
- membership-period correction is atomic and audited
- overlapping period correction is rejected
- payment correction is atomic and does not change entitlement
- duplicate transaction hash is rejected
- Telegram username correction does not alter numeric Telegram ID/link state
- stale preview is rejected with no partial write
- Review open/resolve transitions are audited
- legacy Review resolution clears only the intended active flag
- automation safety switches remain unchanged

UI/build regression coverage must confirm:
- protected/system fields render read-only
- each editable section uses Preview before save
- Review controls appear correctly for open/clear members
- dashboard Review filtering uses open review cases
- Add Member remains first in the quick-action row
- existing Add Member and Phase 2 membership-action suites still pass
- production build succeeds

## Rollout strategy

1. Finish and ship the already-approved Add Member button-order revision independently.
2. Implement universal editing/review work in an isolated feature branch/worktree.
3. Add review-case schema and scoped RPCs with rollback-safe tests before UI rollout.
4. Apply the schema migration only after explicit production approval.
5. Seed existing Review cases without resolving or changing member entitlements.
6. Deploy application code to Vercel Preview and verify protected admin flows and runtime logs.
7. Integrate to Production only after Preview approval and final regression verification.
8. Recheck member counts, automation switches and known safety invariants after deployment.
9. Begin manual Review reconciliation only after the workflow is proven in Production.

The first reconciliation exercise should deliberately cover three different cases: one former member with uncertain historical dates, one protected complimentary member, and Taap270 as the active paid case.

No bulk correction or bulk Review resolution is part of rollout.

## Acceptance criteria

The feature is complete when:
- any supported operational field can be corrected through an audited focused editor
- immutable/system/provenance fields cannot be manually overwritten
- every structural change has an explicit preview and confirmation
- stale writes and duplicates fail safely
- Review can be opened, resolved and later reopened without losing prior cases
- every live `migration_review=true` issue found by the rollout preflight is represented as an open Review case before manual cleanup begins; the expected 2026-10-01 baseline is 25 dashboard members plus Blackwolf's separate historical flagged period
- resolving a legacy case never requires invented historical information
- the active Review count reaches zero only after every open case has been deliberately resolved
- Activity & Audit History remains append-only and reconstructs all corrections
- Telegram numeric identity and automation state remain protected

## Non-goals

This project does not implement:
- Telegram bot linking or relinking
- Telegram group access automation
- automatic payment verification
- automatic campaign/reminder sending
- arbitrary raw database editing
- deletion or rewriting of audit/event history
- automated inference of unknown historical facts
- bulk resolution of the current Review queue

Later phases may consume the cleaned member data, but this project is focused on safe data maintenance and review resolution only.
