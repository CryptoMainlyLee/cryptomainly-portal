# Add Member Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe, audited manual onboarding flow for genuinely new Paid, Complimentary, and Trial members from the VIP Admin dashboard.

**Architecture:** Add a dedicated `/admin/vip/new` flow backed by pure TypeScript validation/preview helpers and one atomic Supabase creation RPC. The UI performs a server-side duplicate check before final confirmation, while the RPC repeats hard-stop duplicate checks inside the transaction immediately before inserts.

**Tech Stack:** Next.js 14.2.x App Router, React 18, TypeScript 5.4, Tailwind CSS, Supabase/Postgres PL/pgSQL, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-01-add-member-design.md`

## Global Constraints

- Supported entitlement types are exactly `paid`, `complimentary`, and `trial`.
- Expiry remains authoritative.
- Start date + duration calculates expiry; manual override is allowed only with a separate required override reason.
- Paid requires amount and currency; payment date is optional and must remain NULL when omitted.
- Complimentary and Trial must not create payment rows.
- Exact normalized email or Telegram username duplicates hard-stop creation.
- Similar display-name matches are warnings only and require explicit acknowledgement.
- Telegram usernames may be stored before bot verification, but numeric Telegram IDs must never be fabricated.
- Creation must be atomic and audited.
- Existing automation safety switches must remain unchanged.
- No Telegram invite/removal/reinstatement behavior belongs in this feature.

## Review Focus

- Telegram input containing leading `@`, mixed case, surrounding whitespace, or blank-only content must normalize predictably and must not bypass duplicate protection.
- Blank payment date for Paid must leave `payments.received_at` NULL; no fallback date may be invented by UI, server action, or RPC.
- Final expiry equal to or before the start date must be rejected, including when supplied through manual override.
- Complimentary/Trial requests containing payment fields must be rejected rather than silently creating or accepting payment data.
- A hard duplicate created after review but before confirm must still be blocked transactionally by the RPC, with no partial member rows.

## File Structure

- Create `app/admin/vip/_lib/new-member.ts` — pure normalization, validation, preview, and name-similarity helpers.
- Create `tests/admin-vip-new-member.test.ts` — Node tests for the pure helpers and client-visible rules.
- Create `supabase/migrations/20261001_add_member.sql` — atomic `admin_create_member` RPC and grants.
- Create `supabase/tests/add_member.sql` — rollback-only SQL regression tests for creation, duplicate protection, audit, rollback, and safety switches.
- Modify `app/admin/vip/_lib/data.ts` — typed duplicate lookup and create-member RPC client.
- Modify `app/admin/vip/actions.ts` — authenticated duplicate-check and create-member server actions.
- Create `app/admin/vip/new/page.tsx` — authenticated new-member route shell.
- Create `app/admin/vip/new/AddMemberForm.tsx` — two-stage form, duplicate review, confirmation, and error UI.
- Modify `app/admin/vip/page.tsx` — Add Member quick-action button.

---

### Task 1: Pure new-member rules and preview

**Files:**
- Create: `app/admin/vip/_lib/new-member.ts`
- Create: `tests/admin-vip-new-member.test.ts`

**Interfaces:**
- Defines `NewMemberDraft` with: `displayName`, `email`, `telegramUsername`, `entitlementType`, `startDate`, `durationValue`, `durationUnit`, `manualExpiry`, `expiryOverrideReason`, `reason`, `amount`, `currency`, `paymentDate`, `txHash`, `paymentNote`, and `similarNameAcknowledged`.
- Produces `normalizeEmail(value: string): string | null`
- Produces `normalizeTelegramUsername(value: string): string | null`
- Produces `normalizeDisplayName(value: string): string`
- Produces `isSimilarDisplayName(a: string, b: string): boolean`
- Produces `buildNewMemberPreview(input: NewMemberDraft): NewMemberPreview`
- Produces `validateNewMemberDraft(input: NewMemberDraft): ValidatedNewMemberDraft`
- `ValidatedNewMemberDraft` normalizes optional identity/payment fields to `null`, carries `calculatedExpiry` and `finalExpiry`, and preserves `similarNameAcknowledged` for the server-side warning gate.

- [ ] **Step 1: Write failing normalization and validation tests**

Cover: email trim/lowercase, Telegram `@` removal/lowercase, blank optional values -> NULL, invalid/blank display name, unsupported entitlement type, positive whole duration, calculated month-end expiry, and final expiry after start date.

- [ ] **Step 2: Run the new test file and verify RED**

Run: `node --test tests/admin-vip-new-member.test.ts`
Expected: FAIL because `new-member.ts` exports do not yet exist.

- [ ] **Step 3: Implement the normalization/validation interfaces**

Use the existing `addMembershipDuration`, `assertIsoDate`, `validatePositiveWholeNumber`, `validateRenewAmount`, `normalizeCurrency`, and `normalizeOptionalText` helpers where appropriate rather than duplicating calendar/payment rules.

- [ ] **Step 4: Add failing preview/override/name-warning tests**

Assert: calculated expiry is shown, manual override changes only final expiry, override without reason rejects, exact normalized name warns, punctuation/case-insensitive containment warns only when shorter normalized name is at least 5 characters, unrelated names do not warn.

- [ ] **Step 5: Implement preview and name-similarity helpers**

`buildNewMemberPreview()` must return both `calculatedExpiry` and `finalExpiry`, plus `expiryOverridden` and normalized identity fields.

- [ ] **Step 6: Run helper tests and existing Phase 2 tests**

Run: `node --test tests/admin-vip-new-member.test.ts tests/admin-vip-membership-actions.test.ts`
Expected: PASS with zero failures.

- [ ] **Step 7: Commit**

`git add app/admin/vip/_lib/new-member.ts tests/admin-vip-new-member.test.ts && git commit -m "test: define new member onboarding rules"`

### Task 2: Atomic Supabase creation RPC

**Files:**
- Create: `supabase/migrations/20261001_add_member.sql`
- Create: `supabase/tests/add_member.sql`

**Interfaces:**
- Produces RPC `public.admin_create_member(p_display_name text, p_email text, p_telegram_username text, p_entitlement_type text, p_start_date date, p_duration_value integer, p_duration_unit text, p_final_expiry date, p_expiry_override_reason text, p_reason text, p_amount numeric, p_currency text, p_payment_date date, p_tx_hash text, p_payment_note text, p_actor_id text)`.
- RPC returns `member_id uuid`, `membership_period_id uuid`, `payment_id uuid`, `telegram_account_id uuid`, and `event_id uuid`.
- Expected safe RPC errors: `INVALID_INPUT`, `DUPLICATE_EMAIL`, `DUPLICATE_TELEGRAM`, and `DUPLICATE_TX_HASH`.
- Consumes `public.cm_add_membership_duration(date, integer, text)` from Phase 2.

- [ ] **Step 1: Write the rollback-only SQL regression test first**

The test must cover Paid, Complimentary, and Trial creation; optional Paid payment date; no-payment enforcement for Complimentary/Trial; email duplicate block; Telegram duplicate block with `@`/case normalization; transactional duplicate re-check; audit/event rows; Telegram stub fields; and unchanged automation switches.

- [ ] **Step 2: Run the SQL test against a database without the new migration and verify RED**

Expected: FAIL because `public.admin_create_member(...)` is missing.

- [ ] **Step 3: Implement `admin_create_member` in the migration**

The RPC must validate all inputs, normalize email/Telegram values, calculate expiry with `cm_add_membership_duration`, require override reason when final expiry differs, hard-stop exact normalized duplicates inside the transaction, insert all related rows atomically, and return the created IDs.

Use exact persisted values from the spec:
- `members.source_system = 'admin_manual'`
- `members.first_joined_on = start date`
- `members.marketing_status = 'unknown'`
- `membership_periods.source = 'phase2_admin_create'`
- event type `MEMBER_CREATED`
- audit action `MEMBER_CREATED`, entity type `member`

- [ ] **Step 4: Add privilege assertions**

Revoke execution from `public`, `anon`, and `authenticated`; grant only `service_role`, matching the Phase 2 RPC security pattern.

- [ ] **Step 5: Run the new SQL suite and Phase 2 SQL regression suite**

Expected: both rollback-only suites complete without exception and leave no synthetic records.

- [ ] **Step 6: Commit**

`git add supabase/migrations/20261001_add_member.sql supabase/tests/add_member.sql && git commit -m "feat: add atomic member creation rpc"`

### Task 3: Server data and action boundary

**Files:**
- Modify: `app/admin/vip/_lib/data.ts`
- Modify: `app/admin/vip/actions.ts`
- Test: `tests/admin-vip-new-member.test.ts`

**Interfaces:**
- Add `NewMemberDuplicateResult` and `NewMemberCreateResult` types in `data.ts`.
- Add `checkNewMemberDuplicates(input: Pick<ValidatedNewMemberDraft, "displayName" | "email" | "telegramUsername">): Promise<NewMemberDuplicateResult>` in `data.ts`; it may reuse `getMembers()` for advisory name matching, but exact email/Telegram checks must be normalized and deterministic.
- Add `createNewMember(input: ValidatedNewMemberDraft): Promise<NewMemberCreateResult>` in `data.ts` calling `rpc/admin_create_member`.
- Add authenticated server actions `checkNewMemberDuplicatesAction(input: NewMemberDraft)` and `createNewMemberAction(input: NewMemberDraft)`.
- `createNewMemberAction` must repeat the latest duplicate check immediately before the RPC and return `SIMILAR_NAME_ACK_REQUIRED` if advisory matches exist and `similarNameAcknowledged` is false.

- [ ] **Step 1: Add failing tests for action-safe validation/error mapping**

Assert that hard duplicate codes map to stable UI-safe results, malformed drafts never reach the data write, Complimentary/Trial payment payloads are rejected, and similar-name matches require `similarNameAcknowledged=true` before creation can proceed.

- [ ] **Step 2: Run the targeted Node tests and verify RED**

Run: `node --test tests/admin-vip-new-member.test.ts`
Expected: FAIL on the new server-boundary expectations.

- [ ] **Step 3: Implement typed data-layer functions**

Extend the existing `supabaseRest` pattern rather than adding a new database client. Add safe handling for expected create-member error codes, including duplicate identity and duplicate transaction-hash failures without exposing raw database text.

- [ ] **Step 4: Implement authenticated server actions**

Both actions must call `requireAdminSession()`. The duplicate-check action returns hard matches plus advisory similar-name matches. The create action re-validates the draft, calls the RPC, revalidates `/admin/vip`, and returns or redirects to the newly created member detail route only after success.

- [ ] **Step 5: Run Node tests**

Run: `node --test tests/admin-vip-new-member.test.ts tests/admin-vip-membership-actions.test.ts`
Expected: PASS with zero failures.

- [ ] **Step 6: Commit**

`git add app/admin/vip/_lib/data.ts app/admin/vip/actions.ts tests/admin-vip-new-member.test.ts && git commit -m "feat: add new member server actions"`

### Task 4: Add Member page and two-stage form

**Files:**
- Create: `app/admin/vip/new/page.tsx`
- Create: `app/admin/vip/new/AddMemberForm.tsx`
- Modify: `app/admin/vip/page.tsx`

**Interfaces:**
- Consumes `buildNewMemberPreview`, `checkNewMemberDuplicatesAction`, and `createNewMemberAction`.
- Produces route `/admin/vip/new` and quick-action link labeled `Add Member`.

- [ ] **Step 1: Add a failing lightweight dashboard/route smoke test**

Create `scripts/test-admin-add-member-ui.mjs` that asserts the dashboard source exposes `href="/admin/vip/new"`, the quick-action label is `Add Member`, and the new route/form files exist. Run it before creating the route and verify it fails.

- [ ] **Step 2: Implement the authenticated route shell**

`app/admin/vip/new/page.tsx` must use the same `hasAdminSession()` guard as the existing admin routes and redirect unauthenticated requests to `/admin/vip/login`.

- [ ] **Step 3: Implement `AddMemberForm`**

Use two explicit states: details and review. Calculate expiry immediately from start + duration, expose optional manual expiry, require override reason only when changed, show Paid-only payment fields, and show Telegram as `Not linked` when only a username is supplied.

- [ ] **Step 4: Wire duplicate review and final confirmation**

Before entering final review, call the authenticated duplicate-check action. Hard matches block and link to the existing member; similar-name warnings require a confirmation checkbox. Final submit calls the create action only after the review state is accepted.

- [ ] **Step 5: Add the dashboard button and correct stale safety copy**

Place `Add Member` immediately beside Clear filters / Active only / Review queue. Remove or update the stale `read-only` wording on the admin dashboard so it no longer contradicts the already-live write actions; preserve the message that Telegram/payment automation remains disabled.

- [ ] **Step 6: Run UI smoke test, Node tests, and production build**

Run:
- `node scripts/test-admin-add-member-ui.mjs`
- `node --test tests/admin-vip-new-member.test.ts tests/admin-vip-membership-actions.test.ts`
- `npm run build`

Expected: all tests PASS and build exits 0.

- [ ] **Step 7: Commit**

`git add app/admin/vip/new app/admin/vip/page.tsx scripts/test-admin-add-member-ui.mjs && git commit -m "feat: add admin Add Member flow"`

### Task 5: Apply database migration and verify live safety invariants

**Files:**
- Uses: `supabase/migrations/20261001_add_member.sql`
- Uses: `supabase/tests/add_member.sql`

**Interfaces:**
- Consumes the completed RPC from Task 2.
- Produces the live database capability required by the Preview/Production app.

- [ ] **Step 1: Capture pre-migration live invariants**

Record current member counts by status, current automation switch values, and current Blackwolf canonical entitlement/expiry as a safety baseline.

- [ ] **Step 2: Apply the migration through Supabase migration tooling**

Apply only `20261001_add_member.sql`; do not mutate existing member rows as part of the migration.

- [ ] **Step 3: Run rollback-only SQL regression suites against live schema**

Run the new `supabase/tests/add_member.sql` and existing `supabase/tests/phase2_membership_actions.sql`. Expected: no exception, all synthetic data rolled back.

- [ ] **Step 4: Re-check live invariants**

Confirm member counts, canonical records, and all four automation switches exactly match the pre-migration snapshot.

- [ ] **Step 5: Verify RPC permissions**

Confirm `service_role` can execute `admin_create_member`, while `anon` and `authenticated` cannot.

### Task 6: Preview, production rollout, and final verification

**Files:**
- No new implementation files unless verification exposes a defect.

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified live Add Member capability without changing a real member during validation.

- [ ] **Step 1: Run full local verification from a clean branch/worktree**

Run:
- `git status --short`
- `node --test tests/admin-vip-new-member.test.ts tests/admin-vip-membership-actions.test.ts`
- `node scripts/test-admin-add-member-ui.mjs`
- `npm run build`

Expected: only intentional tracked changes, zero test failures, build exit 0.

- [ ] **Step 2: Push feature branch and verify Vercel Preview**

Verify `/admin/vip/new` loads behind admin auth, the dashboard button is correctly positioned, calculated expiry/override behavior is visible, and duplicate checking can be exercised without creating a permanent member.

- [ ] **Step 3: Verify Preview runtime logs**

Check for 5xx responses, Supabase errors, leaked raw database details, or authentication failures. Expected: none during the exercised flow.

- [ ] **Step 4: Integrate to `main` only after Preview verification**

Use the existing safe integration pattern: preserve current main, merge/fast-forward only the verified feature commit(s), rerun Node tests and `npm run build`, then push `main`.

- [ ] **Step 5: Verify Production**

Confirm production deployment is READY, `/admin/vip` and `/admin/vip/new` return successfully, the Add Member button is in the requested quick-action row, and existing public site behavior remains intact.

- [ ] **Step 6: Re-check database and automation invariants after production traffic**

Confirm no member was created by verification, member counts remain as expected, and all four automation switches remain OFF.

- [ ] **Step 7: First real use**

Prefer the first permanent Paid creation to be a genuine new customer. Do not create fake financial history merely to prove the form works unless the user explicitly approves a synthetic permanent record.
