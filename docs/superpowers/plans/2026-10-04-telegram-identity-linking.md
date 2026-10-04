# CryptoMainly Phase 3A Telegram Identity Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure, audited Telegram identity verification for eligible CryptoMainly members without granting or changing Telegram group access.

**Architecture:** The admin generates a 32-byte opaque one-time credential and stores only its SHA-256 digest through a narrow Supabase RPC. A dedicated Membership bot posts private `/start <token>` updates to a Vercel webhook; one atomic consume/link RPC rechecks entitlement, safeguarding, current/protected identity ownership, and idempotency before upgrading the member's existing Telegram reference row. Group access remains completely outside Phase 3A.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript 5.4, Node `crypto`/`fetch`, Supabase PostgreSQL/PostgREST/RPC, Vercel, Telegram Bot API.

**Spec:** `docs/superpowers/specs/2026-10-04-telegram-identity-linking-design.md`

## Global Constraints

- Raw link token: 32 cryptographically random bytes, unpadded base64url (43 characters); Supabase stores only its SHA-256 digest.
- Token lifetime is exactly 24 hours; tokens are single-use; replacement revokes every previous unconsumed/unrevoked token for that member.
- Eligible membership at issuance and consumption: `ACTIVE` or `LIFETIME`; `FORMER` and currently `Blocked` hard-fail.
- `access_restoration_required=true` does not block identity-only verification.
- One member may have at most one non-NULL verified `telegram_user_id`; one numeric Telegram ID may have only one canonical member owner.
- Existing different verified identity, current username ownership conflict, and protected-identifier conflict hard-fail without reassignment.
- Successful verification updates Telegram's current username (including NULL), preserves `telegram_raw`, sets DM/link verification facts, and grants no group access.
- Phase 3A never inserts, updates, or deletes `telegram_group_access` and never enables the four existing automation switches.
- Future Manual Access Exception behavior is architectural only; do not build access-exception or group-access automation in this plan.
- No Production migration, bot/webhook activation, secret change, merge to `main`, or Production deployment occurs without the explicit gate in the relevant task.

## Review Focus

- Telegram retries the same successful update after the database commit: return success again without duplicating account rows, token consumption, protected identifiers, or audit rows (Task 2 + Task 5).
- Member state changes between issuance and consumption: a later Block revokes pending tokens in the same transaction; later expiry/FORMER state rejects consumption with no partial identity write (Task 2).
- Existing legacy Telegram references: one username-only or raw-only row is upgraded in place; if future data contains multiple unverified rows for one member, fail closed as ambiguous rather than choosing one (Task 2 + Task 3).
- Current/protected username or numeric-ID conflict: hard-fail atomically and expose only generic member-facing bot text (Task 2 + Task 5).
- Malformed/non-private Telegram input, including unsafe numeric IDs and malformed 43-character payloads: acknowledge safely or reject before privileged mutation and never log the raw token (Task 1 + Task 5).

---

### Task 1: Telegram Linking Domain and Credential Helpers

**Files:**
- Create: `app/admin/vip/_lib/telegram-linking.ts`
- Test: `tests/admin-vip-telegram-linking.test.ts`

**Interfaces:**
- Consumes: Node `crypto`; no Supabase or Telegram network calls.
- Produces: `TELEGRAM_LINK_TTL_HOURS`, `createTelegramLinkCredential(botUsername)`, `hashTelegramLinkToken(rawToken)`, `validateTelegramUserId(value)`, `telegramLinkRpcErrorCodeFromDetail(detail)`, `telegramLinkActionFailureForCode(code)`, and `telegramLinkUiState(input)`. Issuance error codes are exactly `TELEGRAM_LINK_STALE_STATE`, `TELEGRAM_LINK_MEMBER_INELIGIBLE`, `TELEGRAM_LINK_MEMBER_BLOCKED`, `TELEGRAM_LINK_ALREADY_VERIFIED`, and `TELEGRAM_LINK_STATE_MISSING`.

- [ ] **Step 1: Write failing domain tests**

Cover: 43-character base64url token shape; 64-character lowercase hex SHA-256 digest; `https://t.me/<bot>?start=<token>` construction; exact 24-hour constant; positive safe-integer Telegram IDs only; exact safe RPC-code parsing; safe admin messages; UI states `not_linked`, `pending`, `verified`, `unavailable`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/admin-vip-telegram-linking.test.ts`
Expected: FAIL because `app/admin/vip/_lib/telegram-linking.ts` does not exist.

- [ ] **Step 3: Implement the domain helpers**

Use `randomBytes(32).toString("base64url")` for raw credentials and `createHash("sha256")` for the stored digest. `validateTelegramUserId` must reject non-integers, non-positive values, and values outside JavaScript's safe-integer range. Keep raw tokens out of thrown error messages.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/admin-vip-telegram-linking.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/vip/_lib/telegram-linking.ts tests/admin-vip-telegram-linking.test.ts
git commit -m "feat: add Telegram linking domain helpers"
```

### Task 2: Database Schema, Atomic RPCs, Safeguarding Revocation, and SQL Tests

**Files:**
- Create: `supabase/migrations/<generated>_phase3a_telegram_identity_linking.sql` using `supabase migration new phase3a_telegram_identity_linking`
- Create: `supabase/tests/telegram_identity_linking.sql`
- Create: `tests/admin-vip-telegram-linking-sql-contract.test.ts`

**Interfaces:**
- Consumes: existing `members`, `membership_periods`, `telegram_accounts`, `member_safeguarding_state`, `member_protected_identifiers`, `audit_log`, `system_settings`.
- Produces: `telegram_link_tokens`; metadata-only RPC `admin_get_telegram_link_status(...)`; RPC `admin_issue_telegram_link_token(...)`; RPC `telegram_consume_identity_link(...)`; Block-trigger token revocation; one-verified-account-per-member database constraint. The token table itself is not granted SELECT to `service_role`; server reads pending metadata only through `admin_get_telegram_link_status`.

- [ ] **Step 1: Write the failing SQL-contract test**

Assert the migration defines RLS-enabled `telegram_link_tokens`; unique `token_hash`; partial uniqueness for unresolved tokens per member; partial uniqueness of `telegram_accounts.member_id` when `telegram_user_id IS NOT NULL`; fixed safe `search_path` on privileged RPCs; service-role-only execution; safeguarding-state-first locking; no DML against `telegram_group_access`; and no writes that enable automation settings.

- [ ] **Step 2: Run the SQL-contract test and verify RED**

Run: `node --test tests/admin-vip-telegram-linking-sql-contract.test.ts`
Expected: FAIL because the Phase 3A migration does not exist.

- [ ] **Step 3: Create the migration with the Supabase CLI and implement the schema**

Run `supabase migration new phase3a_telegram_identity_linking`; use the generated filename. Define `telegram_link_tokens(id, member_id, token_hash, issued_at, issued_by, issued_safeguarding_version, expires_at, revoked_at, revoked_by, revocation_reason, consumed_at, consumed_update_id, created_at)` with FK/check/index constraints, RLS, and no direct table privileges for public/anon/authenticated/service_role. Add metadata-only `admin_get_telegram_link_status(p_member_id uuid)` for service-role reads; it returns no `token_hash`.

- [ ] **Step 4: Implement `admin_issue_telegram_link_token`**

Signature: `(p_member_id uuid, p_expected_safeguarding_version bigint, p_token_hash text, p_actor_id text) -> table(token_id uuid, expires_at timestamptz, revoked_count integer)`.

Lock `member_safeguarding_state` first and require its current version to equal `p_expected_safeguarding_version`; otherwise raise only `TELEGRAM_LINK_STALE_STATE`. Require current ACTIVE/LIFETIME and unblocked state; allow pending access restoration; reject an existing verified numeric ID; revoke every prior unresolved token; insert the new digest plus current safeguarding version with `expires_at = now() + interval '24 hours'`; write `TELEGRAM_LINK_TOKEN_REVOKED` and `TELEGRAM_LINK_TOKEN_ISSUED` audit entries atomically.

- [ ] **Step 5: Implement `telegram_consume_identity_link`**

Signature: `(p_token_hash text, p_update_id bigint, p_telegram_user_id bigint, p_telegram_username text) -> table(result_code text, member_id uuid, telegram_account_id uuid, linked_at timestamptz, replayed boolean)`.

The RPC finds the token, handles exact same-update replay as success without new writes, rejects other consumed/expired/revoked states, then locks safeguarding state before Telegram rows and rechecks current entitlement/safeguarding/identity ownership before mutation. Result codes are exactly `LINKED`, `ALREADY_LINKED_IDEMPOTENT`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `TOKEN_REVOKED`, `TOKEN_CONSUMED`, `MEMBER_INELIGIBLE`, `MEMBER_BLOCKED`, `TELEGRAM_ID_OWNED`, `MEMBER_HAS_DIFFERENT_TELEGRAM_ID`, `TELEGRAM_USERNAME_CONFLICT`, `TELEGRAM_ACCOUNT_AMBIGUOUS`, `PROTECTED_IDENTIFIER_CONFLICT`, and `SAFEGUARDING_STATE_MISSING`.

For expected business conflicts, write `TELEGRAM_LINK_REJECTED` only when the token is known and authenticated, return a safe `result_code`, and commit no identity mutation. Do not raise an exception that would roll the rejection audit back. Unknown/malformed tokens do not create membership audit noise.

- [ ] **Step 6: Implement verified-identity mutation semantics**

Upgrade the member's single existing unverified Telegram row in place when present; create one row only when none exists. If more than one unverified row exists, return `TELEGRAM_ACCOUNT_AMBIGUOUS` and mutate nothing. Preserve `telegram_raw`; set `telegram_user_id`, current username/NULL, first `linked_at`, first `bot_started_at`, current `last_verified_at`, and `dm_available=true`. Consume the token and write `TELEGRAM_IDENTITY_LINKED` audit data in the same transaction.

When `ever_blocked=true`, create the required `PROTECTED_IDENTIFIER_CAPTURED` safeguarding event only for newly captured identifiers and capture the verified numeric ID plus any newly observed current username with `capture_source='telegram_verified'`. Existing protected identifiers already owned by the same member are accepted/idempotent; cross-member protected collisions return a rejection result with no partial writes.

- [ ] **Step 7: Add Block-time revocation inside the safeguarding transaction**

Create an `AFTER UPDATE OF is_blocked` trigger on `member_safeguarding_state` for `false -> true`. Revoke every unresolved Phase 3A token for that member and write `TELEGRAM_LINK_TOKEN_REVOKED` audit detail using the Block actor; unblocking never reverses revocation.

- [ ] **Step 8: Write rollback-safe SQL behavior tests**

Cover issuance/replacement/24-hour expiry; ACTIVE/LIFETIME success; FORMER/Blocked rejection; pending-restoration allowance; Block-trigger revocation; same-update idempotent replay; different-update token reuse rejection; numeric-ID owner conflict; existing-different-ID conflict; current/protected username conflict; protected numeric-ID conflict; username NULL; in-place username/raw-only upgrade; multiple-unverified-row ambiguity rejection; same-member protected-identifier idempotency; one verified row per member; and induced-failure rollback.

Also snapshot and assert unchanged `telegram_group_access` row count and the four automation-setting values throughout the suite. End the SQL suite with `ROLLBACK`.

- [ ] **Step 9: Run static SQL contract and regression tests**

Run: `node --test tests/admin-vip-telegram-linking-sql-contract.test.ts tests/admin-vip-safeguarding-sql-contract.test.ts`
Expected: PASS. Do not apply the migration to Production in this task.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/*phase3a_telegram_identity_linking.sql supabase/tests/telegram_identity_linking.sql tests/admin-vip-telegram-linking-sql-contract.test.ts
git commit -m "feat: add Telegram identity linking database boundary"
```

### Task 3: Server Data Boundary and Safe Result Mapping

**Files:**
- Modify: `app/admin/vip/_lib/data.ts`
- Modify: `tests/admin-vip-telegram-linking.test.ts`

**Interfaces:**
- Consumes: Task 1 safe-code helpers; Task 2 RPC names/result columns.
- Produces: `TelegramPendingLink`, `TelegramConsumeResult`, `getPendingTelegramLink(memberId)`, `issueTelegramLinkToken(input)`, and `consumeTelegramIdentityLink(input)`.

- [ ] **Step 1: Extend the failing tests for server-boundary contracts**

Assert exact RPC error/result mapping, pending-token shape, safe failure for unknown codes, and that no helper returns/stores a raw token except the Task 1 in-memory credential object.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/admin-vip-telegram-linking.test.ts`
Expected: FAIL on missing data-boundary exports.

- [ ] **Step 3: Add link-state and RPC types to `data.ts`**

`TelegramPendingLink`: `{ token_id: string; member_id: string; issued_at: string; expires_at: string }`.

`TelegramConsumeResult`: `{ result_code: string; member_id: string | null; telegram_account_id: string | null; linked_at: string | null; replayed: boolean }`.

- [ ] **Step 4: Implement `getPendingTelegramLink(memberId)`**

Call `rpc/admin_get_telegram_link_status` and receive only unresolved token metadata (`id/member_id/issued_at/expires_at`), never `token_hash`; return the row or `null`. The UI/domain layer decides whether an unresolved row is already expired.

- [ ] **Step 5: Implement issuance and consume RPC wrappers**

`issueTelegramLinkToken({ memberId, expectedSafeguardingVersion, tokenHash, actorId? })` POSTs only the digest plus expected safeguarding version to `rpc/admin_issue_telegram_link_token` and requires one result row.

`consumeTelegramIdentityLink({ tokenHash, updateId, telegramUserId, telegramUsername })` POSTs verified Telegram facts to `rpc/telegram_consume_identity_link` and requires one result row. It must preserve returned business `result_code` values rather than converting them to raw database errors.

- [ ] **Step 6: Run focused + existing identity tests**

Run: `node --test tests/admin-vip-telegram-linking.test.ts tests/admin-vip-member-editing.test.ts tests/admin-vip-safeguarding.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/admin/vip/_lib/data.ts tests/admin-vip-telegram-linking.test.ts
git commit -m "feat: add Telegram linking server boundary"
```

### Task 4: Authenticated Admin Link Generation and Member UI

**Files:**
- Modify: `app/admin/vip/actions.ts`
- Create: `app/admin/vip/[memberId]/TelegramLinkingPanel.tsx`
- Modify: `app/admin/vip/[memberId]/page.tsx`
- Create: `scripts/test-admin-telegram-linking-ui.mjs`
- Modify: `tests/admin-vip-telegram-linking.test.ts`

**Interfaces:**
- Consumes: `createTelegramLinkCredential`, `issueTelegramLinkToken`, `getPendingTelegramLink`, existing `hasAdminSession`, current member/safeguarding facts.
- Produces: `generateTelegramLinkAction({memberId, expectedSafeguardingVersion})` returning either `{ok:true, deepLink:string, expiresAt:string}` or a safe typed failure; `TelegramLinkingPanel` presenting the four approved UI states.

- [ ] **Step 1: Write failing action/UI contract tests**

Assert admin session is required; missing `TELEGRAM_MEMBERSHIP_BOT_USERNAME` fails safely; successful action returns the raw deep link only in that one response; the member page loads unresolved token metadata; and the rendered UI labels identity as separate from VIP group access.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/admin-vip-telegram-linking.test.ts`
Expected: FAIL on missing action/UI wiring.

- [ ] **Step 3: Implement `generateTelegramLinkAction`**

Require the existing admin session, validate the member UUID and expected safeguarding version, generate the credential in memory, call `issueTelegramLinkToken` with only the hash plus expected version, then build/return the deep link. Never log the credential. Use server env `TELEGRAM_MEMBERSHIP_BOT_USERNAME`; do not introduce a client-visible env variable.

- [ ] **Step 4: Implement `TelegramLinkingPanel`**

Show `Not linked`, `Link pending`, `Verified`, or `Unavailable`. After fresh generation, show `Copy Link`/`Open Bot` plus a bearer-link warning. After refresh, a pending link shows expiry but cannot reconstruct/copy the old raw link; offer `Generate replacement` instead.

Verified state displays the read-only numeric ID and clearly states `VIP group access: Not managed by Phase 3A`. Unavailable state explains the admin-facing reason without offering generation.

- [ ] **Step 5: Wire the member page**

Fetch pending link metadata alongside the existing member/account data and render `TelegramLinkingPanel` above the existing username editor. Preserve username editing as a factual correction path; do not make link generation part of that editor.

- [ ] **Step 6: Add and run UI smoke coverage**

Run: `node scripts/test-admin-telegram-linking-ui.mjs`
Expected: PASS for four state labels, Generate/Replace controls, sensitive-link copy, read-only ID, and `VIP group access: Not managed by Phase 3A` copy.

- [ ] **Step 7: Run focused Node tests**

Run: `node --test tests/admin-vip-telegram-linking.test.ts tests/admin-vip-member-editing.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/admin/vip/actions.ts app/admin/vip/[memberId]/TelegramLinkingPanel.tsx app/admin/vip/[memberId]/page.tsx scripts/test-admin-telegram-linking-ui.mjs tests/admin-vip-telegram-linking.test.ts
git commit -m "feat: add Telegram link generation UI"
```

### Task 5: Telegram Webhook Parsing, Authentication, and Retry-Safe Handler

**Files:**
- Create: `app/api/telegram/_lib/telegram-webhook.ts`
- Create: `app/api/telegram/_lib/telegram-bot.ts`
- Test: `tests/telegram-membership-webhook.test.ts`

**Interfaces:**
- Consumes: Task 1 `hashTelegramLinkToken`/ID validation and Task 3 `consumeTelegramIdentityLink` result shape.
- Produces: `parseTelegramStartUpdate(update)`, `webhookSecretMatches(received, expected)`, `botTextForConsumeResult(code)`, `buildTelegramWebhookRegistration(url, secret)`, `sendTelegramBotMessage(input)`, and `handleTelegramMembershipWebhook(input, deps)`.

- [ ] **Step 1: Write failing webhook parser/auth tests**

Cover private `/start <43-char-token>`; optional `/start@BotName`; username present/absent; group/channel updates ignored; missing `from`; malformed payload; non-safe/non-positive update/user/chat IDs; invalid/missing webhook secret; and no raw token in thrown messages.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/telegram-membership-webhook.test.ts`
Expected: FAIL because webhook helper files do not exist.

- [ ] **Step 3: Implement parser and secret validation**

`parseTelegramStartUpdate` returns `{ updateId, chatId, telegramUserId, telegramUsername, rawToken }` only for a private message with a valid `/start` payload. Use the `message.from.id` as identity, require positive safe integers, normalize username by removing a leading `@`/lowercasing only at the database boundary, and never infer identity from username.

`webhookSecretMatches` compares the configured and received secrets without exposing them in errors; empty/missing expected configuration is a server failure, not an authentication bypass.

- [ ] **Step 4: Implement bot response mapping and Bot API sender**

`botTextForConsumeResult` returns the approved success text for `LINKED` and `ALREADY_LINKED_IDEMPOTENT`; every other consume outcome maps to the same generic invalid-link message.

`buildTelegramWebhookRegistration(url, secret)` returns the `setWebhook` request body with the exact HTTPS URL, `secret_token`, and `allowed_updates:["message"]`; it rejects non-HTTPS URLs and missing secrets.

`sendTelegramBotMessage({ botToken, chatId, text, fetchImpl? })` uses native `fetch` against Telegram `sendMessage`; do not add a Telegram SDK dependency and never include the bot token in errors/logs.

- [ ] **Step 5: Implement dependency-injected webhook handler**

`handleTelegramMembershipWebhook(input, deps)` validates the secret before JSON/business processing, safely acknowledges authenticated irrelevant/malformed updates, hashes a valid payload, calls the consume dependency once, and sends success/generic bot text. A same-update replay therefore re-sends success while the database remains unchanged.

If the database commit succeeds but `sendMessage` fails, return a retryable server result so Telegram may redeliver; idempotent consume handling must make that retry safe.

- [ ] **Step 6: Add retry/idempotency behavior tests**

Simulate first-call `LINKED`, same-update `ALREADY_LINKED_IDEMPOTENT`, different-update consumed-token failure, send-message failure after a committed link, invalid secret, malformed JSON/update, and unrelated update. Assert consume/send call counts and generic member-facing failure copy.

- [ ] **Step 7: Run focused tests and commit**

Run: `node --test tests/telegram-membership-webhook.test.ts tests/admin-vip-telegram-linking.test.ts`
Expected: PASS.

```bash
git add app/api/telegram/_lib/telegram-webhook.ts app/api/telegram/_lib/telegram-bot.ts tests/telegram-membership-webhook.test.ts
git commit -m "feat: add Telegram membership webhook handler"
```

### Task 6: Vercel Telegram Webhook Route

**Files:**
- Create: `app/api/telegram/webhook/route.ts`
- Modify: `tests/telegram-membership-webhook.test.ts`

**Interfaces:**
- Consumes: Task 5 handler; server env `TELEGRAM_MEMBERSHIP_BOT_TOKEN` and `TELEGRAM_MEMBERSHIP_WEBHOOK_SECRET`.
- Produces: Next.js `POST(request: Request): Promise<Response>` at `/api/telegram/webhook`.

- [ ] **Step 1: Write failing route-level contract tests**

Assert the route passes `X-Telegram-Bot-Api-Secret-Token` to the handler, never reads secrets from query/body parameters, returns 401 for invalid secret, 200 for safely handled valid/irrelevant updates, and retryable 5xx only for post-commit Telegram-send/transient server failures.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/telegram-membership-webhook.test.ts`
Expected: FAIL on missing route integration.

- [ ] **Step 3: Implement the POST route**

Read server-only env, invoke the dependency-tested handler, and map handler outcomes to HTTP status without logging the update body, raw token, bot token, or webhook secret. Do not export GET/PUT handlers and do not add group-management API calls.

- [ ] **Step 4: Run route/webhook tests and TypeScript**

Run: `node --test tests/telegram-membership-webhook.test.ts && npx tsc --noEmit`
Expected: PASS / exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/telegram/webhook/route.ts tests/telegram-membership-webhook.test.ts
git commit -m "feat: expose Telegram membership webhook"
```

### Task 7: Bot/Webhook Operations Script and Secret-Safe Runbook

**Files:**
- Create: `scripts/configure-telegram-membership-webhook.mjs`
- Create: `docs/telegram-membership-bot-operations.md`
- Test: `tests/telegram-membership-webhook.test.ts`

**Interfaces:**
- Consumes: environment variables `TELEGRAM_MEMBERSHIP_BOT_TOKEN`, `TELEGRAM_MEMBERSHIP_WEBHOOK_SECRET`, `TELEGRAM_MEMBERSHIP_WEBHOOK_URL`.
- Produces: explicit `setWebhook`/`getWebhookInfo` operator flow using `allowed_updates=["message"]`; no secret/token output.

- [ ] **Step 1: Add failing configuration-builder tests**

Test that the webhook request body contains HTTPS URL, `secret_token`, and exactly `allowed_updates:["message"]`; reject non-HTTPS URLs and missing secrets; assert serialized/loggable summaries redact both Telegram secrets.

- [ ] **Step 2: Implement the configuration script**

Use native `fetch`; call `setWebhook`, then `getWebhookInfo` to verify the configured URL and allowed update type. Never print the bot token or webhook secret; failures print only safe status/description text.

- [ ] **Step 3: Write the operations runbook**

Document: create the dedicated CryptoMainly Membership bot in BotFather; enter secrets directly into Vercel/local environment rather than chat/repo; Preview-to-Production webhook switching; `getWebhookInfo` verification; `deleteWebhook` rollback; secret rotation; and the rule that Phase 3A never manages group membership.

- [ ] **Step 4: Run tests and syntax-check the script**

Run: `node --test tests/telegram-membership-webhook.test.ts && node --check scripts/configure-telegram-membership-webhook.mjs`
Expected: PASS / exit 0. Do not call Telegram's live API in this task.

- [ ] **Step 5: Commit**

```bash
git add scripts/configure-telegram-membership-webhook.mjs docs/telegram-membership-bot-operations.md tests/telegram-membership-webhook.test.ts
git commit -m "docs: add Telegram membership bot operations"
```

### Task 8: Full Local Verification Before Any External Activation

**Files:**
- Modify only if verification exposes a defect in Phase 3A files/tests.

**Interfaces:**
- Consumes: Tasks 1-7 completed commits.
- Produces: a locally verified feature branch with no Production or Telegram external mutation.

- [ ] **Step 1: Run the full Node regression suite**

Run: `node --test`
Expected: all tests pass, including the existing 97-test baseline plus new Phase 3A tests.

- [ ] **Step 2: Run all focused admin UI smokes**

Run the existing Add Member, Universal Editing, Safeguarding smokes plus `node scripts/test-admin-telegram-linking-ui.mjs`.
Expected: every smoke prints PASS.

- [ ] **Step 3: Run TypeScript and clean Production build**

Run: `npx tsc --noEmit`; remove `.next`; run `npm run build`.
Expected: TypeScript exit 0 and Next.js build exit 0; only pre-existing non-fatal warnings may remain.

- [ ] **Step 4: Run invariant/static checks**

Run: `git diff --check` and the Phase 3A SQL-contract test. Search Phase 3A code/migration for Telegram group-management Bot API methods and DML against `telegram_group_access`; expected result is none.

- [ ] **Step 5: Review git status**

Ensure generated `.next`, `tsconfig.tsbuildinfo`, logs, secret files, and bot credentials are not staged. The worktree must contain only intentional Phase 3A source/test/docs/migration changes.

- [ ] **Step 6: Commit any verification-only fixes separately**

If no fixes were required, make no empty commit. Stop here and present verification evidence before crossing the Production database gate.

### Task 9: Production Database Activation Gate

**Gate:** Requires explicit user approval after Task 8 evidence. Plan approval/implementation approval alone does not authorize this task.

**Files:**
- Read: generated Phase 3A migration and `supabase/tests/telegram_identity_linking.sql` only; no new product code unless a verified defect is found.

**Interfaces:**
- Consumes: exact locally verified migration bytes from Task 2.
- Produces: Production schema/RPC capability only; no real member is linked, no token is issued, no Telegram webhook is activated.

- [ ] **Step 1: Record Production preflight invariants**

Capture current member/status counts, open Review count, `migration_review` count, Blocked count, Telegram reference/verified counts, `telegram_group_access` count, and all four automation switch values. Treat legitimate business changes since design time as baseline updates, not automatic failures.

- [ ] **Step 2: Integrity-gate the exact migration**

Record byte length and SHA-256 of the local migration. Use the exact same bytes for the rollback-safe dry run and eventual `apply_migration`; abort if the hash changes between checks.

- [ ] **Step 3: Run a rollback-only migration parse/schema test**

Execute the migration SQL inside one `BEGIN ... ROLLBACK` transaction against Production to prove it parses and fits the live schema without persistence. Verify the transaction leaves no `telegram_link_tokens` table/functions behind.

- [ ] **Step 4: Apply the exact migration**

Use Supabase `apply_migration` only after Steps 1-3 pass and the explicit gate is satisfied. Do not insert tokens, verified identities, group access, or synthetic permanent members as part of the migration.

- [ ] **Step 5: Run advisors and security checks**

Verify RLS, grants/revokes, partial unique indexes, function `search_path`, service-role execution, and no new ERROR/WARN security findings. Review performance advisors for actionable Phase 3A issues.

- [ ] **Step 6: Run `telegram_identity_linking.sql` rollback tests**

Run all synthetic behavior cases inside the test transaction and confirm its final rollback removes every synthetic member/token/audit/protected-identifier row.

- [ ] **Step 7: Recheck Production invariants**

Expected: zero permanent Phase 3A token rows and zero verified numeric IDs unless independently created after the preflight; `telegram_group_access` unchanged; all four automation switches still OFF; Review/membership/safeguarding facts unchanged except legitimate concurrent business activity.

### Task 10: Preview + Dedicated Membership Bot End-to-End Gate

**Gate:** Requires explicit user approval after Task 9. Creating a Supabase development branch requires its provider cost confirmation; do not proceed if the quoted cost breaches the user's standing cost limit or the provider confirmation is not approved.

**Files:**
- Use: `docs/telegram-membership-bot-operations.md`
- Use: `scripts/configure-telegram-membership-webhook.mjs`
- No permanent Product/Production data files are created.

**Interfaces:**
- Consumes: migrated Production schema, feature-branch Vercel Preview, dedicated Membership bot, temporary Supabase development branch.
- Produces: disposable end-to-end evidence; no permanent synthetic Production member/Telegram identity.

- [ ] **Step 1: Create an isolated Supabase development branch for E2E**

After cost confirmation, create a temporary Phase 3A branch from the migrated project. Configure the Vercel Preview to use that branch's Supabase URL/service-role secret, not Production data.

- [ ] **Step 2: Seed one clearly synthetic eligible member in the development branch**

Create ACTIVE fixed-term membership + neutral safeguarding state + optional username-only Telegram stub sufficient for the admin flow. Use an unmistakable `phase3a_e2e_test` marker. Do not copy or alter any real member.

- [ ] **Step 3: Create/configure the dedicated CryptoMainly Membership bot**

The user creates the bot in BotFather if it does not yet exist. Bot token and webhook secret are entered directly into Vercel/local secret storage, never pasted into chat, committed to git, or written to docs. Set Preview-only `TELEGRAM_MEMBERSHIP_BOT_USERNAME`, bot token, and webhook secret.

- [ ] **Step 4: Deploy the feature branch to Vercel Preview**

Verify `/admin/vip` authentication, member detail rendering, and `/api/telegram/webhook` availability. Confirm no Production alias is changed.

- [ ] **Step 5: Point the Membership bot webhook to Preview**

Run the configuration script with the Preview HTTPS webhook URL. Verify `getWebhookInfo` reports the exact Preview URL and `allowed_updates=["message"]` without displaying secrets.

- [ ] **Step 6: Exercise one real Telegram start against the synthetic member**

From the Preview admin record, generate a fresh link and use a dedicated test Telegram account to open it and press Start. Expected: success bot message; the synthetic member gains exactly one verified numeric Telegram ID; username is current/NULL as Telegram reports; `dm_available=true`; link/bot/verification timestamps are set; the token is consumed.

- [ ] **Step 7: Verify E2E database and audit facts**

Confirm one `TELEGRAM_IDENTITY_LINKED` audit entry, no duplicate account row, no group-access row, and no automation-setting change. Confirm the synthetic token cannot be reused with a different update and that SQL/Node idempotency tests already cover same-update replay.

- [ ] **Step 8: Disable the Preview webhook after testing**

Use the operations script/runbook to `deleteWebhook` or otherwise remove the Preview target so Telegram cannot continue delivering to a disposable environment.

- [ ] **Step 9: Delete the temporary Supabase development branch**

Deleting the branch removes the synthetic member, token, Telegram identity, and test audit history together. Recheck Production to prove it contains none of the synthetic E2E marker or verified test Telegram identity.

- [ ] **Step 10: Present Preview evidence for approval**

Summarize UI screenshots/smokes, webhook verification, E2E success, zero Production synthetic records, zero `telegram_group_access` changes, and all automation switches OFF. Stop for explicit Production merge/deployment approval.

### Task 11: Final Review, Merge, Production Deploy, and Webhook Cutover

**Gate:** Requires explicit user approval of the Task 10 Preview evidence. Do not infer approval from earlier implementation or migration authorization.

**Files:**
- No new feature scope; only verified fixes from final review are allowed.

**Interfaces:**
- Consumes: reviewed feature branch, migrated Production database, approved Membership bot.
- Produces: deployed Phase 3A application + Production Telegram webhook; still no automatic group access and no automatic real-member linking.

- [ ] **Step 1: Reconcile branch with current `origin/main`**

Fetch current remote state, inspect any mainline changes since `d8cbf70`, and merge/rebase only if needed. Re-run focused/full tests after reconciliation; do not overwrite unrelated work.

- [ ] **Step 2: Run final verification on the exact merge candidate**

Run `node --test`, every admin smoke including Telegram linking, `npx tsc --noEmit`, clean `npm run build`, `git diff --check`, SQL-contract tests, and secret/group-access invariant searches. Expected: all green.

- [ ] **Step 3: Push/update the feature branch and review the PR/Preview**

Confirm the remote feature HEAD matches the locally verified commit and the Vercel Preview is READY. Review changed files to ensure no token, bot secret, webhook secret, recovery code, `.env`, generated artifact, or unrelated file is present.

- [ ] **Step 4: Merge only the approved candidate to `main`**

Use the existing controlled merge path. Confirm local `main`, `origin/main`, PR merge commit, and deployed Vercel commit all identify the same exact SHA before calling the release complete.

- [ ] **Step 5: Configure Production-only Telegram secrets**

Set `TELEGRAM_MEMBERSHIP_BOT_USERNAME`, `TELEGRAM_MEMBERSHIP_BOT_TOKEN`, and a Production webhook secret directly in Vercel Production environment storage. Do not expose values in chat/logs and do not use `NEXT_PUBLIC_` names.

- [ ] **Step 6: Cut the Membership bot webhook to Production**

Point Telegram to `https://www.cryptomainly.co.uk/api/telegram/webhook` with `allowed_updates=["message"]` and the Production `secret_token`. Verify `getWebhookInfo` reports the production URL and no webhook error.

- [ ] **Step 7: Run live non-mutating smoke checks**

Verify Production `/admin/vip` auth routing, member pages, Telegram-link states, invalid webhook-secret rejection, Vercel runtime logs, Production data invariants, zero `telegram_group_access` rows/changes, and all four automation switches OFF.

- [ ] **Step 8: Do not auto-link any real member**

Release completion stops with the capability available. The first permanent Production Telegram link is generated only from a genuine eligible member record after a deliberate admin action; no bulk link creation or outreach is part of deployment.

- [ ] **Step 9: Record the new stable baseline and clean feature workspace**

Record merge/deployment IDs and verified Production counts. After successful release and user acceptance, use the finishing-development-branch workflow to remove the feature worktree/branch safely; never force-delete unrelated or locked OneDrive content.
