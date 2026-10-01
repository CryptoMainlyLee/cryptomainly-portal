# Universal Member Editing & Review Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every legitimate operational member field safely correctable while replacing the legacy Review flag with an auditable, reusable Review-case workflow.

**Architecture:** Keep `/admin/vip/[memberId]` as the central surface and add focused editors for member details, Telegram username, membership periods, payments and Review cases. All writes go through narrowly-scoped service-role-only SECURITY DEFINER RPCs with stale-preview guards and append-only audit/events; Review cases are a new first-class table linked to the exact member/period/payment under review.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript 5.4, Tailwind CSS, Supabase/PostgreSQL, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-01-universal-member-editing-review-design.md`

## Execution precondition

The existing Add Member feature, including commit `fafb830` that moves Add Member to the first quick-action position, must be Preview-verified and integrated to `main` before this plan starts. Create a fresh isolated worktree/feature branch from that updated `main`; do not implement this plan in the Add Member worktree.

## Global Constraints

- Operational data may be corrected; provenance, existing membership events and existing audit records are append-only.
- System-generated IDs, legacy member code, source fields, raw legacy evidence and Telegram numeric identity are never manually editable.
- Telegram username is editable contact data; Telegram numeric user ID/link state is read-only.
- Every structural correction uses Edit → Preview → Confirm → Save and a mandatory reason.
- Unknown historical facts remain NULL/unknown; never invent dates, payments or certainty.
- Review status is reusable: open cases may be resolved, then later new cases may be opened without rewriting old ones.
- Membership expiry remains authoritative; payment edits never change entitlement automatically.
- Editing/Review RPCs must not change Telegram access, reminders, campaigns, payment automation or the four disabled safety switches.
- Controlled values remain exactly: marketing `unknown|allowed|opted_out`; entitlement `paid|complimentary|trial|lifetime|admin`; expiry mode `fixed|lifetime|manual_no_expiry`; payment status `pending|verified|rejected|refunded`.
- Review resolution outcome is exactly `CORRECTED_DATA_UPDATED`, `EXISTING_DATA_CONFIRMED`, or `HISTORICAL_DETAIL_UNKNOWN_ACCEPTED`.
- Manually opening Review requires category and reason; resolving requires outcome and resolution note.
- Migration seeds one open legacy Review case per live `membership_periods.migration_review=true` period and changes no entitlement data.
- Production migration, GitHub push, merge and Production deploy are explicit shared-system gates requiring approval at execution time.

## Review Focus

1. **NULL versus empty historical values:** a blank/unknown date or payment field must stay NULL rather than being coerced to today or an empty-string pseudo-value; pin in Tasks 1, 4 and 5.
2. **Concurrent/stale edits:** a save after the underlying entity changed must return `STALE_PREVIEW` and leave no partial audit/data write; pin in Tasks 3–5.
3. **Telegram identity preservation:** editing or creating a username stub must never change/fabricate numeric user ID, link timestamps or DM state; pin in Tasks 1 and 3.
4. **Multiple Review cases for one member:** dashboard shows the member once, detail shows every open case, and resolving one legacy period case clears only that linked period flag; pin in Tasks 2 and 7.
5. **No invented legacy cleanup:** `HISTORICAL_DETAIL_UNKNOWN_ACCEPTED` must resolve a case while leaving genuinely unknown structured fields NULL; pin in Tasks 1, 2 and 7.

## File structure

- `app/admin/vip/_lib/member-editing.ts` — pure normalization, validation, change-set and Preview helpers for member/period/payment/Telegram edits.
- `app/admin/vip/_lib/review-cases.ts` — pure Review categories/outcomes, validation and presentation helpers.
- `app/admin/vip/_lib/data.ts` — typed reads plus scoped RPC adapters; no validation policy beyond safe RPC error mapping.
- `app/admin/vip/actions.ts` — authenticated server-action boundary, authoritative revalidation and safe UI results.
- `app/admin/vip/[memberId]/MemberDetailsEditor.tsx` — identity/contact Preview/Confirm editor.
- `app/admin/vip/[memberId]/TelegramUsernameEditor.tsx` — username-only editor with numeric identity shown read-only.
- `app/admin/vip/[memberId]/MembershipPeriodEditor.tsx` — one focused editor per period.
- `app/admin/vip/[memberId]/PaymentEditor.tsx` — one focused editor per payment.
- `app/admin/vip/[memberId]/ReviewCasesPanel.tsx` — open/resolve/reopen Review workflow and legacy evidence context.
- `app/admin/vip/[memberId]/page.tsx` — composes the focused editors; does not own form state.
- `app/admin/vip/page.tsx` — dashboard Review queue/filter switches from migration boolean to open Review cases.
- `supabase/migrations/20261001212800_universal_member_editing_review.sql` — Review table/view, seed logic and all scoped editing/Review RPCs.
- `supabase/tests/universal_member_editing_review.sql` — rollback-only SQL regression suite.
- `tests/admin-vip-member-editing.test.ts` and `tests/admin-vip-review-cases.test.ts` — pure validation/Preview tests.
- `scripts/test-admin-member-editing-ui.mjs` — source-level UI wiring/protected-field regression smoke test.

---

### Task 1: Pure editing and Review domain rules

**Files:**
- Create: `app/admin/vip/_lib/member-editing.ts`
- Create: `app/admin/vip/_lib/review-cases.ts`
- Create: `tests/admin-vip-member-editing.test.ts`
- Create: `tests/admin-vip-review-cases.test.ts`

**Interfaces:**
- Produces: `buildChangeSet(before, after)`, `validateMemberDetailsDraft`, `validateMembershipPeriodDraft`, `validatePaymentDraft`, `validateTelegramUsernameDraft`, `requiresStructuralReason`, `londonLocalDateTimeToIso`, `isoToLondonLocalDateTime`, `validateReviewOpenDraft`, `validateReviewResolutionDraft`, `detectReviewConcerns`, and exported draft/change types used by Tasks 6–7.
- [ ] **Step 1: Write RED tests for changed-only Preview output, protected-field exclusion, NULL preservation and no-op rejection.** Assert unchanged fields are omitted, an all-unchanged draft is rejected before save, blank optional historical dates become `null`, Telegram draft contains username only, and attempting to include numeric Telegram identity is impossible through the exported draft type/helpers. Pin the exact field bounds from Step 4 at their valid boundary and one value beyond it.
- [ ] **Step 2: Run `node --test tests/admin-vip-member-editing.test.ts tests/admin-vip-review-cases.test.ts`.** Expected: FAIL because the two domain modules/functions do not exist.
- [ ] **Step 3: Add RED tests for London payment time conversion.** `2026-01-15T12:30` London → `2026-01-15T12:30:00.000Z`; `2026-07-15T12:30` London → `2026-07-15T11:30:00.000Z`; inverse formatting round-trips; blank → `null`; invalid/non-unique DST wall times are rejected rather than guessed.
- [ ] **Step 4: Implement minimal editing helpers and exact controlled-value validation.** `buildChangeSet<T extends Record<string, unknown>>(before:T, after:T): Array<{field:string; before:unknown; after:unknown}>`; drafts normalize strings but preserve NULL unknowns; reject a save when the change set is empty. Bounds: display name 1–200; email optional, normalized lowercase, <=254 and valid enough for storage/duplicate matching; Telegram username optional, strip one leading `@`, lowercase, 5–32 and `[a-z0-9_]+`; member admin notes <=4000; plan name <=200; membership admin note <=4000; protection reason <=500 and required when protection is enabled; payment currency 1–12 matching `[A-Z0-9_-]+`; network <=100; tx hash <=300; payment notes <=2000; Review opening reason and resolution note 1–500. Structural reason predicate returns true for the spec-listed fields; London conversion uses `Intl.DateTimeFormat` candidate-offset round-trip validation without adding a date library.
- [ ] **Step 5: Add RED tests for Review rules and reliable concerns.** Assert manual open requires category+reason, resolve requires outcome+note, all three exact outcomes are accepted, historical-unknown acceptance does not require filling missing dates, reopening is independent, and concern detection flags missing start, impossible known date order and protected complimentary/no-expiry confirmation without inferring unsupported facts.
- [ ] **Step 6: Implement Review constants/types, validators and `detectReviewConcerns`.** Categories: `identity_contact|membership|payment|telegram|historical|other`; origins: `legacy_migration|manual|add_member`; status: `OPEN|RESOLVED`.
- [ ] **Step 7: Run both new suites plus existing Add Member/Phase 2 suites.** Run: `node --test tests/admin-vip-member-editing.test.ts tests/admin-vip-review-cases.test.ts tests/admin-vip-new-member.test.ts tests/admin-vip-membership-actions.test.ts`. Expected: all PASS.
- [ ] **Step 8: Commit.** `git add app/admin/vip/_lib/member-editing.ts app/admin/vip/_lib/review-cases.ts tests/admin-vip-member-editing.test.ts tests/admin-vip-review-cases.test.ts && git commit -m "test: define audited member editing rules"`.

### Task 2: Review-case schema, legacy seeding and Review RPCs

**Files:**
- Create/extend: `supabase/migrations/20261001212800_universal_member_editing_review.sql`
- Create/extend: `supabase/tests/universal_member_editing_review.sql`

**Interfaces:**
- Produces table `public.member_review_cases`, view `public.admin_member_review_summary`, RPCs `admin_open_member_review_case(...)` and `admin_resolve_member_review_case(...)`.
- `admin_open_member_review_case(p_member_id uuid, p_membership_period_id uuid, p_payment_id uuid, p_category text, p_reason text, p_actor_id text)` returns the created case ID/status.
- `admin_resolve_member_review_case(p_case_id uuid, p_member_id uuid, p_resolution_outcome text, p_resolution_note text, p_actor_id text)` returns the resolved case ID/status and linked period ID.
- [ ] **Step 1: Write the rollback SQL tests first.** Cover table constraints, one-open-case uniqueness per member/linked entity/category, open/resolve audit+events, re-open after resolution, and `HISTORICAL_DETAIL_UNKNOWN_ACCEPTED` with missing structured facts unchanged.
- [ ] **Step 2: Verify RED without changing production.** Query `to_regprocedure(...)`/`to_regclass('public.member_review_cases')`; expected absent. If a disposable PostgreSQL target exists, run the rollback suite there and expect missing-object failure. Do not apply production DDL in this task.
- [ ] **Step 3: Define `member_review_cases`.** UUID PK; member FK required with `ON DELETE RESTRICT`; optional membership-period/payment FKs each use `ON DELETE RESTRICT` plus `CHECK (num_nonnulls(membership_period_id,payment_id) <= 1)`; checked origin/category/status/outcome values; required opening reason/opened actor; immutable created/opened timestamps. Enforce `OPEN` ⇒ all resolution fields NULL and `RESOLVED` ⇒ outcome/note/resolved_at/resolved_by all present. Add `CREATE UNIQUE INDEX ... ON member_review_cases(member_id,membership_period_id,payment_id,category) NULLS NOT DISTINCT WHERE status='OPEN'` so one identical open issue cannot be duplicated even when linked IDs are NULL. Enable RLS with no browser-facing policies; server reads occur only with service_role.
- [ ] **Step 4: Define `admin_member_review_summary` and data privileges.** One row per member with `member_id`, `open_review_count`, ordered `review_categories`, earliest-open `review_reason`, and `review_opened_at`; only OPEN cases contribute. Revoke direct table/view access from `public`, `anon` and `authenticated`; grant only the required SELECT access to `service_role` because Review reasons are admin data.
- [ ] **Step 5: Seed legacy cases idempotently with provenance.** One `legacy_migration` case per live period with `migration_review=true`, linked to that exact period. Apply these ordered reason/category rules: (1) protected complimentary + `manual_no_expiry` → `membership`, `Protected indefinite complimentary access requires confirmation.`; (2) current ACTIVE paid period with missing start → `membership`, `Active paid membership start date is missing and requires reconciliation.`; (3) member `first_joined_on` later than a known period expiry → `historical`, `Legacy relationship date occurs after recorded membership expiry and requires review.`; (4) missing period start → `historical`, `Historical membership start date unavailable from migrated source.`; (5) known expiry on/before known start → `historical`, `Historical membership dates are inconsistent and require review.`; (6) `source='legacy_history_reconstruction'` or legacy note explicitly says review → `historical`, `Historical payment/membership classification requires confirmation.`; otherwise use `historical`, `Legacy migration record requires manual review.`. Create matching `REVIEW_OPENED` event/audit provenance with actor `system/review-case-migration-2026-10-01`; do not clear flags or update member/period entitlement fields.
- [ ] **Step 6: Implement open/resolve RPCs and permissions.** Verify linked period/payment belong to the member; resolve only OPEN cases; resolving a linked legacy case clears only that period's `migration_review`; write `REVIEW_OPENED`/`REVIEW_RESOLVED` membership events and root audit records atomically; service_role execute only.
- [ ] **Step 7: Extend SQL tests for seed provenance, multiple cases and data privileges.** Assert each seeded legacy case has matching `REVIEW_OPENED` event/audit metadata identifying the linked period and migration origin. Resolve one linked legacy case and assert another period flag/case remains open; summary still returns one member row with the remaining case count. Assert anon/authenticated cannot SELECT the Review table/view while service_role can.
- [ ] **Step 8: Static verification and commit.** Run `git diff --check`; if no disposable DB exists, record SQL GREEN as deferred to the explicit production migration gate in Task 9. Commit: `feat: add auditable member review cases`.

### Task 3: Member details and Telegram-username correction RPCs

**Files:**
- Extend: `supabase/migrations/20261001212800_universal_member_editing_review.sql`
- Extend: `supabase/tests/universal_member_editing_review.sql`

**Interfaces:**
- Produces `admin_update_member_details(p_member_id uuid, p_expected jsonb, p_proposed jsonb, p_reason text, p_actor_id text)`.
- Produces `admin_update_telegram_username(p_member_id uuid, p_telegram_account_id uuid, p_expected_username text, p_new_username text, p_reason text, p_actor_id text)`; account ID is nullable only when creating the first username stub and is an internal protected identifier, never an editable user value.
- Expected/proposed member JSON keys are exactly `display_name,email,first_joined_on,admin_notes,marketing_status`; unknown keys are rejected.
- [ ] **Step 1: Add RED SQL cases for member correction.** Assert changed-only audit before/after data, normalized duplicate email rejection, structural first-joined change requires reason, minor contact change may use nullable reason, and stale expected snapshot returns `STALE_PREVIEW` with no write/audit.
- [ ] **Step 2: Add RED SQL cases for Telegram correction.** Assert `@`/case normalization, duplicate username rejection, existing numeric Telegram ID/link timestamps/DM state remain byte-for-byte unchanged, and a member with no Telegram row may receive a username stub with all verified-identity fields NULL/false.
- [ ] **Step 3: Implement `admin_update_member_details`.** Lock/reread the member; compare the five expected fields NULL-safely; validate proposed values/controlled status; repeat normalized email duplicate check excluding the same member; update only the five allowed columns and `updated_at`; write `MEMBER_DETAILS_UPDATED` event/audit with changed keys only.
- [ ] **Step 4: Implement `admin_update_telegram_username`.** Serialize the low-volume username duplicate check; normalize exactly like Add Member. When account ID is supplied, lock that row, verify it belongs to the member and compare expected username NULL-safely. When account ID is NULL, create a stub only if the member still has no Telegram-account row; otherwise return `STALE_PREVIEW`. Never touch numeric/link/DM fields; write `TELEGRAM_USERNAME_UPDATED` event/audit.
- [ ] **Step 5: Add security assertions.** Both RPCs executable by `service_role`; denied to `anon` and `authenticated`.
- [ ] **Step 6: Static/full unit verification and commit.** Run `git diff --check` and Task 1 Node suites; SQL GREEN remains Task 9 if no disposable DB. Commit: `feat: add audited member identity corrections`.

### Task 4: Membership-period and payment correction RPCs

**Files:**
- Extend: `supabase/migrations/20261001212800_universal_member_editing_review.sql`
- Extend: `supabase/tests/universal_member_editing_review.sql`

**Interfaces:**
- Produces `admin_correct_membership_period(p_member_id uuid, p_period_id uuid, p_expected jsonb, p_proposed jsonb, p_reason text, p_actor_id text)`.
- Period JSON keys exactly `entitlement_type,plan_name,starts_on,expires_on,expiry_mode,removal_protected,protection_reason,ended_early_on,admin_note`; `source`, `legacy_notes`, IDs and timestamps are never accepted.
- Produces `admin_correct_payment(p_member_id uuid, p_payment_id uuid, p_expected jsonb, p_proposed jsonb, p_reason text, p_actor_id text)`.
- Payment JSON keys exactly `amount,currency,network,tx_hash,status,received_at,notes`; IDs, verification method/actor/timestamps and created_at are never accepted. `received_at` is canonical offset-aware ISO text or NULL by the time it reaches the RPC; the UI's London `datetime-local` value is converted by Task 1 first. Legacy `amount`/currency may remain NULL when genuinely unknown; any non-NULL amount must be finite and greater than zero.
- [ ] **Step 1: Add RED SQL cases for period correction.** Assert NULL-safe stale guards, required reason, allowed controlled values, source/legacy evidence untouched, detectable overlapping entitlement rejected, and unknown historical dates may remain NULL. If both start/expiry are known for `fixed`, expiry must be after start; `lifetime`/`manual_no_expiry` must not acquire a fabricated expiry. `removal_protected=true` requires a non-empty protection reason; false normalizes protection reason to NULL. If `ended_early_on` and start are both known it cannot precede start, and if a fixed expiry is known it cannot fall after expiry.
- [ ] **Step 2: Implement `admin_correct_membership_period`.** Lock/reread selected period, verify member ownership and exact expected snapshot, reject unknown JSON keys, validate complete proposed state, then reuse Phase 2's inclusive overlap predicate against every other period: `coalesce(other.starts_on,'-infinity'::date) <= proposed_effective_end` and `coalesce(other.ended_early_on,other.expires_on,'infinity'::date) >= coalesce(proposed.starts_on,'-infinity'::date)`, where proposed effective end is `coalesce(ended_early_on,expires_on,'infinity')`. Update only allowed fields, then write `MEMBERSHIP_PERIOD_CORRECTED` event/audit atomically.
- [ ] **Step 3: Add RED SQL cases for payment correction.** Assert stale guard, reason required for amount/status/received_at/tx hash changes, blank received date stays NULL, duplicate tx hash rejected, verification metadata untouched, and member/period entitlement fields are unchanged before/after payment correction.
- [ ] **Step 4: Implement `admin_correct_payment`.** Verify payment belongs to member, reject unknown JSON keys, normalize currency/optional tx hash/network/notes, validate controlled status and amount, preserve NULL received_at, update only allowed fields, and write `PAYMENT_CORRECTED` event/audit atomically.
- [ ] **Step 5: Add permissions and switch invariants.** service_role-only execute for both RPCs; snapshot the four automation settings before synthetic corrections and assert identical afterward.
- [ ] **Step 6: Static/full unit verification and commit.** `git diff --check` plus all Node suites; SQL GREEN remains Task 9 if necessary. Commit: `feat: add audited membership and payment corrections`.

### Task 5: Server data and authenticated action boundary

**Files:**
- Modify: `app/admin/vip/_lib/data.ts`
- Modify: `app/admin/vip/actions.ts`
- Extend tests: `tests/admin-vip-member-editing.test.ts`, `tests/admin-vip-review-cases.test.ts`

**Interfaces:**
- Adds `MemberPayment` fields `payment_id,member_id,membership_period_id,offer_id,amount,currency,network,tx_hash,status,verification_method,received_at,verified_at,verified_by,notes,created_at`; `MemberTelegramAccount` fields `telegram_account_id,member_id,telegram_user_id,telegram_username,telegram_raw,bot_started_at,linked_at,dm_available,last_verified_at,created_at`; full `MemberReviewCase` table fields; `MemberReviewSummary`; and extends `MemberOverview` with `open_review_count,review_categories,review_reason,review_opened_at`.
- Adds reads `getMemberPayments(memberId)`, `getMemberTelegramAccounts(memberId)`, `getMemberReviewCases(memberId)`, `getOpenReviewSummaries()` and `findMemberIdentityConflict({excludeMemberId,email,telegramUsername})`; `getMembers()` merges Review summary data and defaults missing summary to zero/no reason. The conflict helper returns `{memberId,displayName,field}` or null and always excludes the member being edited.
- Adds RPC adapters `updateMemberDetails`, `updateTelegramUsername`, `correctMembershipPeriod`, `correctPayment`, `openReviewCase`, `resolveReviewCase`.
- Adds authenticated server actions named exactly `updateMemberDetailsAction`, `updateTelegramUsernameAction`, `correctMembershipPeriodAction`, `correctPaymentAction`, `openReviewCaseAction`, `resolveReviewCaseAction`, returning `{ok:true}` or safe typed error results; no raw Supabase detail reaches the browser.
- [ ] **Step 1: Write RED unit tests for safe error mapping and server validation.** Pin `STALE_PREVIEW`, `DUPLICATE_EMAIL`, `DUPLICATE_TELEGRAM`, `DUPLICATE_TX_HASH`, `OVERLAPPING_ENTITLEMENT`, `DUPLICATE_REVIEW_CASE`, `REVIEW_CASE_NOT_OPEN`, `INVALID_INPUT`; unknown database details map only to generic `SERVER_ERROR` at the action layer.
- [ ] **Step 2: Add typed reads, identity-conflict lookup and RPC adapters.** Reuse the existing `supabaseRest` boundary; do not expose service-role key/client-side fetches. `getMemberPayments` orders newest first; `getMemberTelegramAccounts` returns every account row for the member with protected account/numeric/link fields; `getMemberReviewCases` orders OPEN first then newest; Review summary merge is deterministic. `findMemberIdentityConflict` normalizes email/Telegram exactly like editing, excludes `excludeMemberId`, and returns the first deterministic matching member/field for safe UI linking.
- [ ] **Step 3: Add six authenticated actions.** Each calls `requireAdminSession()`, revalidates the proposed draft using Task 1 helpers, rejects no-op saves, derives/validates mandatory reason rules, calls exactly one scoped RPC, revalidates `/admin/vip` and `/admin/vip/[memberId]`, and returns safe result codes instead of redirecting away from client Preview state.
- [ ] **Step 4: Add stale/duplicate action-result tests.** Assert correct safe message/code for each expected RPC conflict and generic fail-closed behavior for unknown failures; on `DUPLICATE_EMAIL`/`DUPLICATE_TELEGRAM`, re-query with `findMemberIdentityConflict` and return `existingMemberId` when available without exposing database detail. Review actions must not report success if the case was concurrently resolved/opened.
- [ ] **Step 5: Run TypeScript and Node regression.** `npx tsc --noEmit --incremental false` then `node --test tests/admin-vip-member-editing.test.ts tests/admin-vip-review-cases.test.ts tests/admin-vip-new-member.test.ts tests/admin-vip-membership-actions.test.ts tests/admin-vip-dashboard-ui.test.ts`; expected PASS.
- [ ] **Step 6: Commit.** `git add app/admin/vip/_lib/data.ts app/admin/vip/actions.ts tests && git commit -m "feat: add audited member edit server actions"`.

### Task 6: Member detail editors for identity, Telegram, periods and payments

**Files:**
- Create: `app/admin/vip/[memberId]/MemberDetailsEditor.tsx`
- Create: `app/admin/vip/[memberId]/TelegramUsernameEditor.tsx`
- Create: `app/admin/vip/[memberId]/MembershipPeriodEditor.tsx`
- Create: `app/admin/vip/[memberId]/PaymentEditor.tsx`
- Modify: `app/admin/vip/[memberId]/page.tsx`
- Create/extend: `scripts/test-admin-member-editing-ui.mjs`

**Interfaces:**
- Consumes Task 1 validation/change-set helpers and Task 5 server actions/types.
- Each editor receives the authoritative current entity snapshot as props and manages only its own Edit/Preview/Confirm state.
- Protected IDs/provenance fields are rendered as read-only context outside editable inputs; no hidden input carries a protected new value.
- [ ] **Step 1: Write/extend the UI smoke test first.** Assert four focused editor components exist; detail page renders them; literal protected fields (`telegram_user_id`, legacy/source evidence, system IDs) are displayed but are not wired as editable form names; every editor contains a Review/Preview stage before its confirm action.
- [ ] **Step 2: Run `node scripts/test-admin-member-editing-ui.mjs`.** Expected: FAIL because focused editors are absent.
- [ ] **Step 3: Implement `MemberDetailsEditor`.** Editable: display name, email, first joined date, admin notes, marketing status. Preview only changed fields; require reason when first joined changes; send initial snapshot as stale guard; preserve entered values after correctable server errors.
- [ ] **Step 4: Implement `TelegramUsernameEditor`.** Render one editor per existing `MemberTelegramAccount`; if none exists, render a create-stub editor with protected account ID = NULL. Show account ID, numeric ID, link timestamps and DM status read-only; edit username only; Preview normalized before/after; duplicate conflict links to the returned existing member when available; a newly-created username stub remains explicitly “Not linked”.
- [ ] **Step 5: Implement `MembershipPeriodEditor`.** Render one editor per period beside immutable source/legacy evidence. Allow only the nine approved fields; preserve NULL historical dates; Preview changed fields and require a reason for every period correction; label this as data correction rather than Renew/Add Time.
- [ ] **Step 6: Implement `PaymentEditor`.** Render one editor per payment and keep verification metadata read-only. `received_at` uses `datetime-local` labelled **Europe/London** and Task 1's tested London conversion helper; blank maps to NULL, not now/today. Require a reason for every payment correction.
- [ ] **Step 7: Integrate reads in `page.tsx`.** Fetch member, periods, history, payments, Telegram-account rows and Review cases together; preserve existing Membership Actions and notes; add clear success/error banners for the new safe result codes without removing legacy evidence/history.
- [ ] **Step 8: Run smoke, Node, typecheck and build.** `node scripts/test-admin-member-editing-ui.mjs`; full Node suites; `npx tsc --noEmit --incremental false`; `npm run build`. Expected all PASS; existing warnings may be documented but no new errors.
- [ ] **Step 9: Commit.** `git add app/admin/vip/[memberId] scripts/test-admin-member-editing-ui.mjs && git commit -m "feat: add focused member record editors"`.

### Task 7: Review panel and dashboard queue

**Files:**
- Create: `app/admin/vip/[memberId]/ReviewCasesPanel.tsx`
- Modify: `app/admin/vip/[memberId]/page.tsx`
- Modify: `app/admin/vip/page.tsx`
- Extend: `scripts/test-admin-member-editing-ui.mjs`
- Extend: `tests/admin-vip-dashboard-ui.test.ts`

**Interfaces:**
- Consumes `MemberReviewCase`/Review summary data and Task 5 open/resolve actions.
- Dashboard Review state is `open_review_count > 0`; `membership_periods.migration_review` is no longer the dashboard workflow predicate.
- [ ] **Step 1: Write RED UI/dashboard tests.** Pin Review quick filter to open cases, card label/count to open Review members, one dashboard row for a member with multiple cases, and display of category/reason/open count. Pin `ReviewCasesPanel` copy for all three resolution outcomes including “Reviewed — historical detail unknown/accepted”.
- [ ] **Step 2: Implement `ReviewCasesPanel`.** List OPEN cases first with linked period/payment context and preserved evidence links/text; call `detectReviewConcerns` for the linked/current structured data and show only deterministic concerns it returns. Each case resolves independently with required outcome+note. Provide **Mark In Review** with target (member overall or an existing period/payment), category and mandatory reason; allow a new case after prior resolution without mutating history.
- [ ] **Step 3: Switch dashboard semantics.** `review=1` filters `open_review_count > 0`; Review card becomes `Open Reviews`; row shows earliest open reason/category plus `+N more` when applicable. Keep Add Member first, then Clear filters, Active only, Review queue.
- [ ] **Step 4: Preserve migration provenance on detail page.** Period-level `migration_review`/legacy evidence remains visible until its linked legacy case resolves, but it is not treated as the long-term dashboard flag.
- [ ] **Step 5: Run UI, Node, typecheck and build.** Expected all PASS, including Add Member button-order regression and existing Phase 2/Add Member suites.
- [ ] **Step 6: Commit.** `git add app/admin/vip scripts tests && git commit -m "feat: add reusable member review workflow"`.

### Task 8: Pre-migration whole-branch verification and review

**Files:** no intended production-code changes unless review finds a defect.

- [ ] **Step 1: Run clean-tree verification.** `git status --short`, all Node tests, both UI smoke scripts, `npx tsc --noEmit --incremental false`, `npm run build`, `git diff --check`.
- [ ] **Step 2: Review the whole branch against the approved spec.** Use `superpowers:requesting-code-review`; if no fresh reviewer/subagent tool is available, perform an explicit fresh self-review and record that limitation. Inspect SQL for SECURITY DEFINER/search_path/privileges, JSON whitelist enforcement, stale locks, audit atomicity and immutable fields.
- [ ] **Step 3: Fix each Important/Critical finding one at a time with RED→GREEN evidence.** Rerun the full verification after fixes; Minor findings may be ledgered/deferred only when they do not weaken acceptance criteria.
- [ ] **Step 4: Capture the exact production migration candidate.** Record migration filename/hash and ensure the branch is clean. Do not push or apply DDL yet.

### Task 9: Approved production database migration and SQL GREEN gate

**Shared-system gate:** stop and obtain explicit approval immediately before `supabase apply_migration`.

- [ ] **Step 1: Capture live preflight snapshot.** Member status counts; four automation switches; Blackwolf current entitlement; every `migration_review=true` period/member; counts of flagged periods and distinct members; deterministic ordered checksums/counts for `members`, `membership_periods`, `payments` and `telegram_accounts`; current function/table absence/presence; no synthetic test rows.
- [ ] **Step 2: Reconcile seed expectations.** The 2026-10-01 design baseline is 26 flagged periods across 26 members (25 current dashboard Review members plus Blackwolf's historical period), but use the live preflight as authority and investigate any difference before applying DDL.
- [ ] **Step 3: Apply only `20261001212800_universal_member_editing_review.sql`.** Never edit an already-applied migration in place; any correction after application is a new migration.
- [ ] **Step 4: Immediately run rollback-safe SQL GREEN suites.** Run `supabase/tests/universal_member_editing_review.sql`, then existing `supabase/tests/add_member.sql` and `supabase/tests/phase2_membership_actions.sql`. Expected: all PASS with synthetic writes rolled back.
- [ ] **Step 5: Verify persistent seed and permissions.** Exactly one OPEN `legacy_migration` case exists for every preflight flagged period; every original `migration_review` flag remains true until manual resolution; summary distinct-member count matches the preflight distinct-member count; service_role has execute and anon/authenticated do not for all six new RPCs.
- [ ] **Step 6: Compare post-migration invariants.** Operational table checksums/counts, member status counts, Blackwolf current entitlement and the four switches match preflight; only the intended Review-case rows and their seed event/audit provenance may be new. Confirm no synthetic test data remains.
- [ ] **Step 7: On any failure, stop rollout.** Use systematic debugging; do not push Preview app code. If applied DDL needs repair, add a forward corrective migration and rerun every SQL suite/invariant check.

### Task 10: Preview, Production and post-deploy verification

**Shared-system gates:** explicit approval before feature-branch push if not already authorized, and again before merge/push to `main`/Production.

- [ ] **Step 1: Rerun local verification on the exact clean commit to be pushed.** All Node/UI/type/build checks PASS.
- [ ] **Step 2: Push feature branch and wait for Vercel Preview READY.** Verify deployment commit SHA matches branch HEAD and inspect build/runtime logs for 5xx, raw Supabase errors or auth failures.
- [ ] **Step 3: Verify Preview read-only interaction.** `/admin/vip/new` still works; `/admin/vip` shows Add Member first and open-Review semantics; representative member pages show all focused editors, protected fields read-only, Preview stages working, Review cases/evidence visible. Do not confirm a permanent member edit merely to test Preview.
- [ ] **Step 4: Obtain Preview approval, then integrate to `main`.** Preserve unrelated local/stashed work, rerun verification after integration, push `main`, and wait for Production READY.
- [ ] **Step 5: Verify Production.** Public site healthy; admin dashboard/member pages healthy behind auth; runtime logs clean; open Review seed count intact; member counts, Blackwolf and four automation switches unchanged; no member data was modified by deployment verification.
- [ ] **Step 6: Mark software rollout complete only after verification-before-completion evidence.** Keep Review reconciliation as the next controlled operational phase, not an automated migration.

### Task 11: Manual reconciliation of every open Review case

**No bulk updates.** Each real-member correction is a deliberate data operation after the software is proven in Production.

- [ ] **Step 1: Generate the live Review checklist from OPEN cases.** Include member, linked entity, category/reason, current structured values and preserved legacy evidence; do not rely on the original 25/26 snapshot if the live list changed.
- [ ] **Step 2: Validate three representative cases first.** One former member with uncertain historical dates; one protected complimentary/no-expiry member; Taap270 as the active paid high-care case. For each, inspect evidence, Preview proposed changes, obtain case-level confirmation, then save/resolve through the new workflow.
- [ ] **Step 3: Continue case-by-case only after the representative workflow is sound.** Correct every fact supported by source evidence/user knowledge; leave genuinely unknowable fields NULL and use `HISTORICAL_DETAIL_UNKNOWN_ACCEPTED` with an explanatory note rather than inventing values.
- [ ] **Step 4: For protected complimentary cases, explicitly confirm intent.** Preserve `complimentary`, `manual_no_expiry`, removal protection and a meaningful protection reason unless evidence supports a correction; resolving Review must not weaken protection accidentally.
- [ ] **Step 5: Resolve linked legacy flags individually.** After each resolution, verify only that case's linked `migration_review` flag cleared, all other open cases remain, and audit/event history records the before/after/resolution reason.
- [ ] **Step 6: Finish only when the live queue is genuinely clear.** OPEN Review distinct-member count = 0, no unresolved legacy flag is orphaned from a Review case, member status counts are explainable from deliberate corrections, and all four automation switches remain OFF.

## Completion verification

Before declaring the project complete:
- run all Node tests and both UI smoke scripts;
- run `npx tsc --noEmit --incremental false` and `npm run build`;
- rerun all three rollback SQL suites;
- verify new RPC permissions and no synthetic records;
- verify Production deployment SHA/READY state and runtime logs;
- verify Review queue zero only after individual resolution, not through bulk clearing;
- verify Activity & Audit History can reconstruct every correction and Review transition;
- use `superpowers:verification-before-completion` and `superpowers:finishing-a-development-branch` for the final handoff.
