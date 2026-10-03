# Blocked Member Safeguarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable member-level Blocked safeguarding system that prevents contact/access and duplicate re-entry without rewriting membership, Review, Telegram, payment, or audit history.

**Architecture:** Add a dedicated safeguarding subsystem with one current-state row per member, append-only safeguarding events, a durable protected-identifier ledger, tracked operational tasks, and a shared effective relationship policy. Existing membership and editing RPCs remain the factual-data authority but gain server-side safeguarding guards; Add Member gains protected-identity checks; the admin UI consumes the same server policy and never acts as the only enforcement layer.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript 5.4, Tailwind CSS, Supabase/PostgreSQL, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-03-blocked-member-safeguarding-design.md`

## Global Constraints

- `Blocked` is additive to `ACTIVE|FORMER|LIFETIME`; it never becomes a fourth membership status.
- Blocked always means both no contact and no membership/group access until deliberately unblocked.
- Unblocking never restores access automatically; ACTIVE/LIFETIME requires a separate audited Restore Access action.
- Restore Access resumes only the still-valid existing entitlement; it creates no new period and adds no blocked-time credit.
- `marketing_status`, `removal_protected`, Review state, and `migration_review` retain their existing meanings and are not repurposed.
- Factual identity, membership, payment, Telegram-username, and Review corrections remain allowed while Blocked under existing audit rules.
- Protected system IDs and numeric Telegram ID stay read-only; Telegram username remains editable.
- Every safeguarding mutation is service-role only, stale-state guarded, atomic, and append-only in event/audit history.
- Existing automation switches remain OFF; this release does not enable Telegram automation, campaigns, reminders, or payment auto-activation.
- Never edit already-applied migrations in place; safeguarding is a new forward migration.
- No migration may infer or auto-Block Zeb or any other real member.
- No bulk clearing of Review cases or `migration_review`; all existing real Review cases remain individually reconciled.
- Production database migration, branch push, Preview mutation, merge, and `main` push remain explicit shared-system gates.

## Review Focus

1. **Expiry during suspension:** a stored restoration flag must never allow Restore Access after the fixed entitlement has expired; policy/UI/RPC all treat the member as FORMER immediately. Pin in Tasks 1, 2, 4, and 6.
2. **Protected identity races/collisions:** current or historical protected email/Telegram identifiers must never be reassigned to another member, including between preflight and save. Pin in Tasks 2, 3, 5, and 7.
3. **Former-to-active correction after unblock:** if a previously Blocked, currently unblocked FORMER member is factually corrected into ACTIVE/LIFETIME, access must become restoration-required rather than silently usable. Pin in Tasks 2 and 4.
4. **Missing safeguarding state:** sensitive actions must fail closed rather than assume an absent state row means unblocked. Pin in Tasks 2, 4, and 5.
5. **Concurrent transitions:** double Block/Unblock/Restore/task completion or stale version submission must reject with no partial state/event/audit/task write. Pin in Tasks 2 and 5.

## File structure

- `app/admin/vip/_lib/safeguarding.ts` — pure validation, exact safeguarding error codes/outcomes, and UI-safe state helpers.
- `app/admin/vip/_lib/data.ts` — typed safeguarding reads, policy merge, protected duplicate lookup, and scoped RPC adapters.
- `app/admin/vip/_lib/new-member.ts` — extends duplicate-match/error types for Blocked/protected identity outcomes; name similarity remains warning-only.
- `app/admin/vip/_lib/membership-actions.ts` — pure eligibility consumes safeguarding state so relationship actions cannot bypass Blocked/restoration-required UI.
- `app/admin/vip/actions.ts` — authenticated safeguarding server actions plus safeguarding-aware Add Member/edit/action mapping.
- `app/admin/vip/[memberId]/SafeguardingPanel.tsx` — Block/Unblock/Restore Access and Telegram-removal task UI.
- `app/admin/vip/[memberId]/MembershipActions.tsx` — explanatory disable state from safeguarding policy.
- `app/admin/vip/[memberId]/page.tsx` — fetches/composes safeguarding policy, tasks, and history above relationship actions.
- `app/admin/vip/page.tsx` — additive BLOCKED badge/count/filter and encoding cleanup; membership counts remain factual.
- `app/admin/vip/new/AddMemberForm.tsx` — explicit Blocked/protected identity hard-stop presentation.
- `supabase/migrations/20261003064000_blocked_member_safeguarding.sql` — safeguarding schema, policy view, transition RPCs, protected identity integration, and guarded replacement RPC definitions.
- `supabase/tests/member_safeguarding.sql` — rollback-only safeguarding/database regression suite.
- `tests/admin-vip-safeguarding.test.ts` — pure domain/error/eligibility tests.
- Existing Node/UI tests — extended only where safeguarding deliberately changes allowed behavior or UI wiring.
- `scripts/test-admin-safeguarding-ui.mjs` — source-level safeguards for Blocked visibility, confirmations, protected identity messaging, and disabled relationship controls.

---

### Task 1: Safeguarding domain rules and error contract

**Files:**
- Create: `app/admin/vip/_lib/safeguarding.ts`
- Create: `tests/admin-vip-safeguarding.test.ts`
- Modify: `app/admin/vip/_lib/new-member.ts:181-210`
- Modify: `app/admin/vip/_lib/membership-actions.ts:1-213`

**Interfaces:**
- Produces `validateSafeguardingSummary(value:string):string` with trim, required, max 200.
- Produces `validateSafeguardingReason(value:string):string` with trim, required, max 1000.
- Produces exact task outcomes `REMOVED_FROM_TELEGRAM|CONFIRMED_NOT_PRESENT_OR_NO_ACCESS` and validator `validateTelegramRemovalOutcome`.
- Produces safeguarding error codes: `SAFEGUARDING_STALE_STATE`, `MEMBER_ALREADY_BLOCKED`, `MEMBER_NOT_BLOCKED`, `SAFEGUARDING_CONFIRMATION_REQUIRED`, `ACCESS_RESTORATION_NOT_REQUIRED`, `ACCESS_RESTORATION_EXPIRED`, `SAFEGUARDING_TASK_NOT_OPEN`, `ACTION_BLOCKED_BY_SAFEGUARDING`, `PROTECTED_IDENTITY_CONFLICT`, `SAFEGUARDING_STATE_MISSING`.
- Extends `NewMemberDuplicateMatch` with `matchSource:"current"|"protected_history"` and `safeguarding:"blocked"|"previously_blocked"|null`.
- Extends `NewMemberRpcErrorCode` with `BLOCKED_MEMBER_MATCH|PROTECTED_MEMBER_MATCH`.
- Changes `getMembershipActionEligibility` input to require `isBlocked:boolean` and `accessRestorationRequired:boolean`.

- [ ] **Step 1: Write RED tests for summary/reason bounds, task outcomes, and safe RPC error mapping.** Assert exact max lengths, required values, unknown errors → generic server failure, and all safeguarding codes map to non-sensitive admin messages.
- [ ] **Step 2: Write RED eligibility tests.** Blocked disables Change Expiry/Add Time/Renew/Reactivate; ACTIVE/LIFETIME with restoration required disables relationship actions; unblocked FORMER remains eligible for normal Reactivation; factual period editor is not represented by this helper and remains separate.
- [ ] **Step 3: Write RED duplicate-type tests.** Current Blocked and historical protected matches are hard matches; exact/similar display names remain warning-only; numeric Telegram ID is represented as a future strong-identifier type but is not added to the current Add Member form.
- [ ] **Step 4: Run `node --test tests/admin-vip-safeguarding.test.ts tests/admin-vip-membership-actions.test.ts tests/admin-vip-new-member.test.ts`.** Expected: FAIL on missing safeguarding module/new fields.
- [ ] **Step 5: Implement only the pure rules/types above and update existing eligibility/error types.** Do not add database calls or UI in this task.
- [ ] **Step 6: Rerun the three suites.** Expected: PASS.
- [ ] **Step 7: Commit.** `git add app/admin/vip/_lib/safeguarding.ts app/admin/vip/_lib/new-member.ts app/admin/vip/_lib/membership-actions.ts tests && git commit -m "test: define blocked member safeguarding rules"`.

### Task 2: Safeguarding schema, policy, transitions, and Telegram tasks

**Files:**
- Create: `supabase/migrations/20261003064000_blocked_member_safeguarding.sql`
- Create: `supabase/tests/member_safeguarding.sql`

**Interfaces:**
- Creates `member_safeguarding_events(id,member_id,event_type,actor_id,summary,reason,metadata,occurred_at)`; controlled event types are `MEMBER_BLOCKED|MEMBER_UNBLOCKED|MEMBER_ACCESS_RESTORED|ACCESS_RESTORATION_REQUIRED|TELEGRAM_REMOVAL_REQUIRED|TELEGRAM_REMOVAL_COMPLETED|TELEGRAM_NO_ACCESS_CONFIRMED|PROTECTED_IDENTIFIER_CAPTURED`; no UPDATE/DELETE grant or mutation RPC.
- Creates `member_safeguarding_state(member_id PK,is_blocked,ever_blocked,blocked_at,blocked_by,blocked_summary,access_restoration_required,last_unblocked_at,last_unblocked_by,version,created_at,updated_at)`; Blocked requires `ever_blocked=true` and current block fields present, unblocked requires current block fields NULL, and restoration-required cannot coexist with Blocked.
- Creates `member_protected_identifiers(id,member_id,identifier_type,normalized_value,capture_source,captured_by,safeguarding_event_id,captured_at)`; identifier types are `email|telegram_username|telegram_user_id`, capture sources are `block_snapshot|identity_correction|telegram_verified`, with global uniqueness on `(identifier_type,normalized_value)`.
- Creates `member_safeguarding_tasks(id,member_id,block_event_id,task_type,status,outcome,required_at,required_by,completed_at,completed_by,completion_note)`; task type is `telegram_removal`, status is `OPEN|COMPLETED`, and each block event can own at most one Telegram-removal task.
- Creates trigger `cm_ensure_member_safeguarding_state` so every future `members` insert gets a neutral state row in the same transaction; migration backfills one neutral row for every existing member.
- Creates view `admin_member_relationship_policy` exposing state version, Blocked metadata, `ever_blocked`, effective restoration requirement, `telegram_removal_required` (an OPEN Telegram-removal task exists), `contact_allowed`, `access_grant_allowed`, `membership_action_allowed`, and `restore_access_allowed` joined to current entitlement facts.
- Produces `admin_block_member(p_member_id uuid,p_expected_version bigint,p_summary text,p_reason text,p_confirmed boolean,p_actor_id text)`, `admin_unblock_member(p_member_id uuid,p_expected_version bigint,p_reason text,p_acknowledged boolean,p_actor_id text)`, and `admin_restore_member_access(p_member_id uuid,p_expected_version bigint,p_reason text,p_confirmed boolean,p_actor_id text)` returning current state version/flags plus the new safeguarding event ID and Block task ID where applicable.
- Produces `admin_complete_safeguarding_task(p_member_id uuid,p_task_id uuid,p_outcome text,p_note text,p_actor_id text)` returning task status/outcome and safeguarding event ID.

- [ ] **Step 1: Write rollback SQL RED tests for all four tables, constraints, one-row-per-member backfill/insert trigger, RLS/privileges, and append-only event permissions.** Include an induced missing-state row case and assert policy/action helpers fail closed rather than treating it as unblocked.
- [ ] **Step 2: Add RED policy tests for ACTIVE+BLOCKED, FORMER+BLOCKED, LIFETIME+BLOCKED, ACTIVE/LIFETIME restoration-required, and fixed expiry passing while stored restoration flag remains true.** Effective restoration must become false for FORMER and Restore Access must be unavailable.
- [ ] **Step 3: Implement schema, indexes, RLS, privileges, neutral backfill, insert trigger, and `admin_member_relationship_policy`.** `contact_allowed` means safeguarding permits contact (`NOT is_blocked`); downstream marketing rules still apply separately. `access_grant_allowed` additionally requires ACTIVE/LIFETIME and no effective restoration requirement. Missing state makes all allow booleans false.
- [ ] **Step 4: Add RED tests for `admin_block_member(uuid,bigint,text,text,boolean,text)`.** Require expected version, summary, full reason, confirmation; capture current email/all Telegram usernames/numeric IDs; create `MEMBER_BLOCKED`, audit, required Telegram task, increment version; reject double/stale Block atomically.
- [ ] **Step 5: Add RED tests for Telegram-task creation.** ACTIVE/LIFETIME always gets OPEN task; FORMER only when `telegram_user_id IS NOT NULL OR linked_at IS NOT NULL OR dm_available=true`; username or `bot_started_at` alone does not qualify.
- [ ] **Step 6: Implement Block RPC plus internal normalized protected-identifier helper and task creation.** Identifier capture source for initial values is `block_snapshot`; unique conflict with another member returns `PROTECTED_IDENTITY_CONFLICT`; same-member recapture is idempotent; required task creation appends `TELEGRAM_REMOVAL_REQUIRED`.
- [ ] **Step 7: Add RED tests for `admin_unblock_member(uuid,bigint,text,boolean,text)`.** Require reason+acknowledgement; ACTIVE/LIFETIME sets restoration required, FORMER does not; preserve protected identifiers/events/tasks; reject stale/already-unblocked states.
- [ ] **Step 8: Implement Unblock RPC.** Clear current Block presentation fields, set latest unblock actor/time, set restoration requirement from current entitlement, increment version, and write `MEMBER_UNBLOCKED` plus general audit atomically.
- [ ] **Step 9: Add RED tests for `admin_restore_member_access(uuid,bigint,text,boolean,text)`.** Require not Blocked, effective restoration required, still ACTIVE/LIFETIME, reason+confirmation; reject expired/stale/no-requirement cases; assert no membership period/date is rewritten.
- [ ] **Step 10: Implement Restore Access RPC.** Clear stored requirement, increment version, write `MEMBER_ACCESS_RESTORED` plus general audit, and leave existing entitlement rows unchanged.
- [ ] **Step 11: Add RED tests for `admin_complete_safeguarding_task(uuid,uuid,text,text,text)`.** Only OPEN task belonging to member; exact two outcomes; optional note <=1000; repeat completion rejects.
- [ ] **Step 12: Implement task completion RPC.** Update the task once and append `TELEGRAM_REMOVAL_COMPLETED` or `TELEGRAM_NO_ACCESS_CONFIRMED` plus general audit; do not change Blocked/restoration state.
- [ ] **Step 13: Add invariant/security regression tests.** Block/Unblock/Restore/task operations never alter `marketing_status`, membership periods, Review cases, or `migration_review` except the explicit period-correction path in Task 4; Block task creation also appends `TELEGRAM_REMOVAL_REQUIRED`. Assert service_role-only access and rollback on induced mid-transaction failure.
- [ ] **Step 14: Run safeguarding SQL suite on a disposable/local target if available.** Expected: PASS and rollback; otherwise SQL GREEN remains gated to Task 9 before Preview.
- [ ] **Step 15: Run `git diff --check`.** Expected: no whitespace errors.
- [ ] **Step 16: Commit.** `git add supabase/migrations/20261003064000_blocked_member_safeguarding.sql supabase/tests/member_safeguarding.sql && git commit -m "feat: add blocked member safeguarding state"`.

### Task 3: Protect identity continuity and Add Member at the database boundary

**Files:**
- Modify new migration: `supabase/migrations/20261003064000_blocked_member_safeguarding.sql`
- Extend: `supabase/tests/member_safeguarding.sql`
- Reference only, do not edit: `supabase/migrations/20261001_add_member.sql`, `supabase/migrations/20261001212800_universal_member_editing_review.sql`

**Interfaces:**
- New migration replaces the live definitions of `admin_create_member`, `admin_update_member_details`, and `admin_update_telegram_username` with identical existing signatures plus safeguarding enforcement.
- Existing create signature stays unchanged so deployed app compatibility is preserved during migration-first rollout.
- Protected identity conflicts return `BLOCKED_MEMBER_MATCH`, `PROTECTED_MEMBER_MATCH`, or `PROTECTED_IDENTITY_CONFLICT` as appropriate.

- [ ] **Step 1: Add RED SQL tests for Add Member.** Current identifier match to a Blocked member returns `BLOCKED_MEMBER_MATCH`; historical protected match to an unblocked previously Blocked member returns `PROTECTED_MEMBER_MATCH`; ordinary duplicate keeps existing duplicate code; similar/exact display name alone never hard-stops at SQL level.
- [ ] **Step 2: Replace `admin_create_member` in the new migration.** Before inserts, normalize current email/Telegram exactly as today, check protected ledger under the same advisory lock as existing duplicate checks, distinguish current Blocked versus protected-history match, then continue existing creation logic unchanged; insert trigger supplies neutral safeguarding state transactionally.
- [ ] **Step 3: Add RED SQL tests for member email correction on ever-Blocked members.** Old email remains protected, new email becomes protected with capture source `identity_correction`, reverting to a historical protected email owned by the same member is allowed, correction to another member's protected email rejects, and a never-Blocked member does not gain protected-ledger rows merely from editing.
- [ ] **Step 4: Replace `admin_update_member_details` in the new migration.** Preserve the existing stale snapshot, validation, duplicate checks, update fields, membership event, and audit behavior; before/after email capture runs only when `ever_blocked=true`; each newly inserted protected value appends `PROTECTED_IDENTIFIER_CAPTURED`; protected collision fails the entire transaction.
- [ ] **Step 5: Add RED SQL tests for Telegram username correction.** Old/new username protection mirrors email rules; reverting to the same member's historical protected username is allowed; numeric Telegram ID/link timestamps/DM state remain unchanged; protected username owned by another member rejects.
- [ ] **Step 6: Replace `admin_update_telegram_username` in the new migration.** Preserve existing signature/behavior, add protected-ledger collision/capture only for ever-Blocked member, append `PROTECTED_IDENTIFIER_CAPTURED` for newly inserted values, and never mutate numeric/link fields.
- [ ] **Step 7: Add RED regression for future strong identity.** Initial Block captures existing numeric Telegram user ID as normalized text with type `telegram_user_id`; no current admin editor can change it.
- [ ] **Step 8: Run rollback SQL suite on disposable target if available and existing Add Member/Universal Editing SQL suites after the migration.** Expected: all PASS; no test rows persist.
- [ ] **Step 9: Commit.** `git add supabase/migrations/20261003064000_blocked_member_safeguarding.sql supabase/tests/member_safeguarding.sql && git commit -m "feat: enforce protected member identity"`.

### Task 4: Enforce safeguarding in membership actions and factual period correction

**Files:**
- Modify new migration: `supabase/migrations/20261003064000_blocked_member_safeguarding.sql`
- Extend: `supabase/tests/member_safeguarding.sql`
- Extend: `tests/admin-vip-membership-actions.test.ts`
- Reference only: `supabase/migrations/20260823_phase2_membership_actions.sql`, `supabase/migrations/20260823_phase2_former_expiry_correction.sql`

**Interfaces:**
- New migration replaces current definitions/signatures of `admin_change_membership_expiry`, `admin_add_membership_time`, `admin_renew_active_membership`, `admin_reactivate_membership`, and `admin_correct_membership_period` only to add safeguarding guards/state normalization; their existing business logic remains intact.
- Guard error is `ACTION_BLOCKED_BY_SAFEGUARDING`; missing state is `SAFEGUARDING_STATE_MISSING`.

- [ ] **Step 1: Add RED SQL tests proving all four Phase 2 relationship-action RPCs reject while Blocked before any membership/payment/event write.** Factual `admin_correct_membership_period` remains allowed while Blocked.
- [ ] **Step 2: Add RED tests for unblocked ACTIVE/LIFETIME with restoration required.** Change Expiry, Add Time, and active Renew reject; Restore Access is the only way to reopen the existing entitlement. Unblocked FORMER can use normal Reactivation.
- [ ] **Step 3: Replace the four Phase 2 RPC definitions in the new migration with current production-equivalent bodies plus an early relationship-policy guard.** Do not edit prior migration files or change unrelated Phase 2 validation/audit semantics.
- [ ] **Step 4: Add RED test for FORMER→ACTIVE/LIFETIME factual correction after unblock.** If `ever_blocked=true`, `is_blocked=false`, and a period correction changes effective status from FORMER to ACTIVE/LIFETIME, atomically set stored `access_restoration_required=true`, increment state version, and append an `ACCESS_RESTORATION_REQUIRED` safeguarding event/audit reasoned as a factual-entitlement correction; do not grant access.
- [ ] **Step 5: Extend `admin_correct_membership_period` replacement accordingly.** A correction that leaves status FORMER does not create restoration state; a correction while currently Blocked stays Blocked and does not need a separate restoration flag until Unblock evaluates the then-current entitlement.
- [ ] **Step 6: Add RED test for expiry occurring without a write.** Policy view immediately reports effective restoration false/Restore unavailable once current status is FORMER even if stored flag remains true; next authorized safeguarding/membership mutation may normalize stored flag false without inventing a Restore event.
- [ ] **Step 7: Extend Node membership eligibility tests to mirror database policy.** Pass the two new required safeguarding booleans in every existing case; assert prior non-safeguarding behavior is unchanged when both are false.
- [ ] **Step 8: Run safeguarding SQL, Phase 2 SQL, Universal Editing SQL, and membership Node suites on a disposable target where available.** Expected: all PASS.
- [ ] **Step 9: Commit.** `git add supabase/migrations/20261003064000_blocked_member_safeguarding.sql supabase/tests/member_safeguarding.sql tests/admin-vip-membership-actions.test.ts app/admin/vip/_lib/membership-actions.ts && git commit -m "feat: enforce safeguarding on membership actions"`.

### Task 5: Server data/action boundary and safe duplicate lookup

**Files:**
- Modify: `app/admin/vip/_lib/data.ts:268-753`
- Modify: `app/admin/vip/actions.ts:132-743`
- Extend: `tests/admin-vip-safeguarding.test.ts`
- Extend: `tests/admin-vip-new-member.test.ts`

**Interfaces:**
- Adds types `MemberSafeguardingPolicy`, `MemberSafeguardingEvent`, `MemberSafeguardingTask` and safeguarding fields merged into `MemberOverview`.
- Adds reads `getMemberSafeguardingPolicy(memberId)`, `getMemberSafeguardingEvents(memberId)`, `getMemberSafeguardingTasks(memberId)`, and `getSafeguardingPolicies()`.
- `getMembers()` and `getMember()` must fail closed if a member lacks a policy/state row; they never silently default missing safeguarding to unblocked.
- `checkNewMemberDuplicates` and `findMemberIdentityConflict` additionally read protected identifiers and return enriched match source/safeguarding state.
- Adds adapters `blockMember`, `unblockMember`, `restoreMemberAccess`, `completeSafeguardingTask` with exact RPC signatures from Task 2.
- Adds authenticated actions `blockMemberAction`, `unblockMemberAction`, `restoreMemberAccessAction`, `completeSafeguardingTaskAction` returning `{ok:true}` or typed safe failures.

- [ ] **Step 1: Write RED tests for safeguarding error mapping and missing-state fail-closed behavior.** No raw Supabase detail reaches the browser.
- [ ] **Step 2: Add typed safeguarding reads and deterministic policy merge.** Dashboard/member reads merge by `member_id`; missing state throws a server-side integrity error rather than returning an allow value.
- [ ] **Step 3: Extend duplicate lookup.** Merge current members/Telegram accounts with protected ledger; same canonical member is deduplicated; current Blocked match is `safeguarding:"blocked"`, historical protected match after unblock is `"previously_blocked"`; ordinary duplicates remain `null`; display-name warnings stay unchanged.
- [ ] **Step 4: Extend Add Member action handling.** Preflight hard-stops all strong matches; Blocked gets explicit no-contact/no-access copy and existing member ID; protected-history match directs to canonical record; on create-RPC race errors rerun duplicate lookup before returning safe result.
- [ ] **Step 5: Extend identity-edit conflict lookup.** Email/Telegram corrections reject identifiers protected to another member and link to the canonical conflicting member when safe; same-member historical values are not treated as cross-member conflicts.
- [ ] **Step 6: Implement four safeguarding actions.** Validate UUID/version/summary/reason/confirmation/outcome using Task 1 helpers, call one scoped RPC each, revalidate dashboard/member paths, and return typed results without redirecting away from confirmation state.
- [ ] **Step 7: Add RED→GREEN tests for stale Block/Unblock/Restore/task completion, Blocked/protected duplicate messages, and unknown DB failures.** Expected safe failure, no raw SQL text.
- [ ] **Step 8: Run `npx tsc --noEmit --incremental false` and all Node suites.** Expected PASS.
- [ ] **Step 9: Commit.** `git add app/admin/vip/_lib app/admin/vip/actions.ts tests && git commit -m "feat: add safeguarding server boundary"`.

### Task 6: Member detail safeguarding UI and membership-action lockout

**Files:**
- Create: `app/admin/vip/[memberId]/SafeguardingPanel.tsx`
- Modify: `app/admin/vip/[memberId]/page.tsx:1-440`
- Modify: `app/admin/vip/[memberId]/MembershipActions.tsx`
- Create: `scripts/test-admin-safeguarding-ui.mjs`
- Extend: `scripts/test-admin-member-editing-ui.mjs`

**Interfaces:**
- `SafeguardingPanel` consumes member ID, current policy/version, safeguarding events, and safeguarding tasks; it owns only safeguarding confirmation form state.
- `MembershipActions` receives explicit `isBlocked` and effective `accessRestorationRequired` props and uses Task 1 eligibility helper; database guards remain authoritative.

- [ ] **Step 1: Write RED source/UI smoke assertions.** Detail page renders SafeguardingPanel before MembershipActions; current Blocked shows `BLOCKED`, summary, actor/date, `No contact. No membership/group access.`; unblocked prior history shows `Previously blocked`, latest unblock date, and a path to safeguarding history; pending restore shows `ACCESS RESTORATION REQUIRED`.
- [ ] **Step 2: Add RED confirmation assertions.** Block form requires summary+full reason+explicit confirmation; Unblock requires reason plus exact acknowledgement that no access is restored; Restore requires reason plus explicit existing-entitlement confirmation.
- [ ] **Step 3: Add RED Telegram-task assertions.** OPEN removal task offers exactly `Removed from Telegram` and `Confirmed not present / no access to remove`; completed tasks are read-only history with actor/date/outcome/note.
- [ ] **Step 4: Implement SafeguardingPanel with Preview/Confirm interaction and safe action-result messages.** Active Blocked warning is visually stronger than ordinary Review state; the full immutable Block reason stays in history while the concise summary is prominent.
- [ ] **Step 5: Integrate policy/events/tasks reads in member detail.** Keep Review/editor sections unchanged and usable while Blocked; show safeguarding above ordinary membership actions; Activity & Audit History remains intact.
- [ ] **Step 6: Update MembershipActions lockout.** Disabled controls remain visible with `Unavailable while this member is Blocked.` or `Restore access before changing this active entitlement.`; no hidden client path submits prohibited actions.
- [ ] **Step 7: Run safeguarding/member-editing smoke scripts, Node tests, typecheck, and build.** Expected PASS.
- [ ] **Step 8: Commit.** `git add app/admin/vip/[memberId] scripts tests && git commit -m "feat: add blocked member safeguarding controls"`.

### Task 7: Dashboard visibility, Add Member messaging, and encoding fix

**Files:**
- Modify: `app/admin/vip/page.tsx:1-318`
- Modify: `app/admin/vip/new/AddMemberForm.tsx:1-531`
- Extend: `tests/admin-vip-dashboard-ui.test.ts`
- Extend: `tests/admin-vip-new-member.test.ts`
- Extend: `scripts/test-admin-safeguarding-ui.mjs`

**Interfaces:**
- Dashboard query adds `blocked=1`; factual status/type/review filters remain independent.
- Quick-action order becomes exactly `Add Member → Active only → Review queue → Blocked → Clear filters`.
- Blocked count is additive and does not remove Blocked members from ACTIVE/FORMER/LIFETIME totals.

- [ ] **Step 1: Write RED dashboard tests.** ACTIVE+Blocked is counted in Active and Blocked, `blocked=1` returns it, status filter still works independently, row renders membership status plus a separate high-visibility `BLOCKED` badge, and pending Telegram/restoration warnings render where applicable.
- [ ] **Step 2: Write RED quick-action/encoding tests.** Assert exact button order; dashboard source contains `—` and `View →`; replace all obvious mojibake in this file (`â€”`, `â†’`, `â€¢`, `â€¦`) so the known encoding defect is not partially fixed.
- [ ] **Step 3: Implement dashboard filter/count/badges without changing entitlement calculation.** Preserve Review queue semantics and `Clear filters` as final action.
- [ ] **Step 4: Write RED Add Member UI assertions.** A currently Blocked strong-identity match says no new member can be created/reactivated/invited and links to the existing Blocked record; historical protected identity says use the existing canonical record; neither has an override checkbox/button.
- [ ] **Step 5: Implement AddMemberForm rendering for enriched hard matches.** Similar-name acknowledgement remains exactly as today and cannot display Blocked status from name similarity alone.
- [ ] **Step 6: Run dashboard/New Member/safeguarding tests, smoke scripts, typecheck, and build.** Expected PASS.
- [ ] **Step 7: Commit.** `git add app/admin/vip/page.tsx app/admin/vip/new tests scripts/test-admin-safeguarding-ui.mjs && git commit -m "feat: surface blocked member safeguards"`.

### Task 8: Whole-branch local verification and code review

**Files:** no intended feature changes unless verification finds a defect.

- [ ] **Step 1: Run complete local verification on a clean working tree.** `node --test tests/*.test.ts`; `node scripts/test-admin-member-editing-ui.mjs`; `node scripts/test-admin-add-member-ui.mjs`; `node scripts/test-admin-safeguarding-ui.mjs`; `npx tsc --noEmit --incremental false`; clean `npm run build`; `git diff --check`.
- [ ] **Step 2: Run SQL suites against a disposable/local database if available.** `member_safeguarding.sql`, `universal_member_editing_review.sql`, `add_member.sql`, `phase2_membership_actions.sql`; every suite rolls back synthetic writes and PASSes.
- [ ] **Step 3: Review the whole branch against the approved spec.** Use `superpowers:requesting-code-review` at execution time. Focus on SECURITY DEFINER/search_path/privileges, missing-state fail-closed behavior, protected-identity races, replacement RPC equivalence, atomic audit/event/task writes, and inability to bypass restoration-required state.
- [ ] **Step 4: Fix each Important/Critical finding with RED→GREEN evidence and rerun complete verification.** Minor findings may be deferred only if they do not weaken acceptance criteria.
- [ ] **Step 5: Record exact candidate HEAD and migration SHA256; require clean `git status --short`.** Do not push or apply Production DDL yet.

### Task 9: Explicitly approved Production safeguarding migration and SQL GREEN gate

**Shared-system gate:** stop and obtain explicit approval immediately before applying `20261003064000_blocked_member_safeguarding.sql` to Production Supabase.

- [ ] **Step 1: Capture live preflight snapshot.** Counts by ACTIVE/FORMER/LIFETIME; all 26 current OPEN legacy Review cases and exact flagged periods; Blackwolf current entitlement; four automation switches; counts/checksums for members, periods, payments, Telegram accounts; current safeguarding objects absent; no synthetic rows.
- [ ] **Step 2: Apply only the new safeguarding migration.** Never reapply/edit the already-recorded Universal Editing migration; if correction is needed after apply, create a forward migration.
- [ ] **Step 3: Immediately run rollback-safe SQL suites in this order:** `member_safeguarding.sql`, `universal_member_editing_review.sql`, `add_member.sql`, `phase2_membership_actions.sql`. Expected: all PASS and rollback synthetic writes.
- [ ] **Step 4: Verify persistent neutral state.** Exactly one safeguarding-state row per real member; zero real Block events; zero real protected identifiers/tasks created merely by migration; zero `is_blocked=true` rows.
- [ ] **Step 5: Verify security.** New transition RPCs service-role only; anon/authenticated cannot execute them or read admin safeguarding tables/view; replacement existing RPC grants remain no broader than before.
- [ ] **Step 6: Compare invariants.** Membership counts unchanged, all 26 Review cases/flags intact, Blackwolf still complimentary start `2026-08-23` expiry `2027-02-23`, all four automation switches OFF, no synthetic data remains.
- [ ] **Step 7: On any mismatch, stop.** Use systematic debugging and a forward corrective migration; do not deploy Preview app code until database GREEN is restored.

### Task 10: Vercel Preview and synthetic safeguarding lifecycle

**Shared-system gates:** explicit approval before pushing new feature commits if required by the current branch state, and before any intentional Preview write against Production Supabase.

- [ ] **Step 1: Rerun local verification on exact clean candidate HEAD, then push the feature branch and confirm Vercel Preview is READY on that exact SHA.** Inspect build/runtime logs for 5xx, raw Supabase errors, or auth failures.
- [ ] **Step 2: Perform read-only Preview inspection first.** Dashboard shows additive Blocked count/filter without changing factual counts; member detail SafeguardingPanel renders neutral state; Add Member/Review/editing flows still render correctly; encoding defects are gone.
- [ ] **Step 3: With explicit approval, create one clearly synthetic member through the normal Add Member UI and run the full lifecycle:** Block → verify Telegram-removal task → complete task → Unblock → verify ACCESS RESTORATION REQUIRED while entitlement valid → Restore Access. Confirm each step creates the expected state, safeguarding event, general audit entry, and no unrelated Review mutation.
- [ ] **Step 4: Exercise hard-stop behavior with the synthetic identity.** While Blocked, Add Member using its email/Telegram must hard-stop with no override. After Unblock/Restore, change a strong identifier through audited editing and prove both old and new protected values still route to the same canonical member.
- [ ] **Step 5: Exercise expiry/restoration edge safely using rollback SQL rather than corrupting the Preview member.** Prove expired fixed entitlement cannot Restore Access and former-to-active correction creates restoration-required state.
- [ ] **Step 6: Remove the synthetic lifecycle in one ID-scoped cleanup transaction.** Before deletion capture the synthetic member ID plus generated period/payment/Telegram/review/safeguarding task/event IDs; delete only rows tied to those captured synthetic IDs from safeguarding tasks/identifiers/events, Review cases, payments, membership events, Telegram accounts, membership periods, safeguarding state, and matching audit-log entities, then delete the synthetic member. Roll back on any unexpected row count and verify no real member ID was touched.
- [ ] **Step 7: Recheck Production invariants after Preview testing.** 16 ACTIVE / 58 FORMER baseline remains explainable unless a deliberate real action occurred; 26 OPEN legacy Review cases/flags intact; Blackwolf unchanged; four automation switches OFF.
- [ ] **Step 8: Present final Preview and verification evidence for explicit approval.** Do not merge/push `main` yet.

### Task 11: Approved integration to `main` and post-deploy verification

**Shared-system gate:** explicit approval is mandatory immediately before merge/push to `main`.

- [ ] **Step 1: Reconcile feature branch with current `main` without losing the already-live Add Member release or Universal Editing work.** Resolve only real conflicts, rerun all Node/UI/type/build/SQL verification, and record final integration SHA.
- [ ] **Step 2: Merge/push only after approval and wait for Production READY on the exact integrated SHA.** No production action is inferred from Preview approval alone.
- [ ] **Step 3: Verify Production read paths.** Public site healthy; admin dashboard/member/Add Member pages healthy; Blocked filter/count available; no member is auto-Blocked; runtime logs clean.
- [ ] **Step 4: Verify Production invariants again.** Review cases/flags, Blackwolf, factual member counts, and all four automation switches remain correct; no synthetic/test records remain.
- [ ] **Step 5: Mark rollout complete only after `superpowers:verification-before-completion` and `superpowers:finishing-a-development-branch`.** Real members such as Zeb are Blocked only through a subsequent deliberate admin action, never by deployment logic.

## Completion verification

Before declaring the capability complete: all Node tests and UI smokes PASS; TypeScript and clean Next.js build PASS; all four rollback SQL suites PASS; new/modified RPC permissions are verified; protected identity race tests PASS; no synthetic records remain; 26 existing Review cases remain individually controlled; Blackwolf and automation switches are unchanged; Production deployment SHA is confirmed; and no real Block decision was inferred by migration/deployment.
