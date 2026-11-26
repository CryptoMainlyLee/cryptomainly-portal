# CryptoMainly V1.35 / Next.js 16 — private writable acceptance sandbox

## Scope and restoration
- Date: 26 November 2026.
- Branch: `feature/mi-v135-next16-writable-test-2026-11-26`, created from the successfully cloud-tested **read-only** Next.js 16 commit `2e966092779f286919551841127a045e0eab28eb`.
- New private editorial sandbox branch `v135-next16-test-20261126` in `CryptoMainlyLee/cryptomainly-editorial-sandbox`, cloned from verified `b9742a9c730acf7580371a54c6fe828b3dbcd955`: six candidates (one sent/Telegram message #9, two unknown permanently locked, three unsent). Original sandbox branch remains unchanged.
- Single allowable Telegram acceptance candidate: Glassnode item `0200d4cc-6aa7-4b3f-abb5-a1ba52195667`, presently unreserved. Other candidate sends and editorial changes are blocked by branch-only route guards.
- Real VIP Telegram group `-1001694306052` is NEVER used. Transport code pins private TEST group `-1004432697280`, exact receipt schema and one reservation per candidate. Existing Make scenario `10208938` must be confirmed inactive prior to enabling a one-shot send.
- Source and state Git repos remain separate. No live member data, production editorial registry, Google Sheets submissions, or user-facing public web posts may be written.

## Cloud QA design
- Next.js 16 `proxy.ts` denies all state-changing HTTP methods except POST to the isolated editorial login and **one pinned candidate** edit route. Sending is **closed by default**, and the send route remains HTTP 403 unless both `MI_MAKE_TEST_ENABLED=true` and `CM_QA_SEND_WINDOW=ARMED_ONE_MESSAGE`. The editor/send application routes independently enforce exact candidate ID and `hostedQaIsolated()`.
- Dedicated `hosted-qa.ts` pins exact Vercel Git branch and exact **new** Git sandbox branch, and rejects Production or other branches.
- Dedicated `scripts/verify-mi-next16-writable-qa.cjs` is invoked by `prebuild` and rejects incorrect Preview environment, real Supabase/service-role credentials, shared production editorial mode, wrong Make destination, missing Git sandbox credential, missing synthetic administrator password and unauthorised sending configuration. It allows a separate deliberate send-armed state only with valid EU2 Make endpoint, separate API key and pinned `TEST_ONLY` destination.
- Noindex, nofollow and no-store headers on private Preview. Vercel authentication protection must remain enabled. Offline legacy tests can run only on loopback with no Vercel environment.
- The previous read-only QA branch `security/mi-v135-next16-integration-2026-11-25` remains entirely unchanged and available as a rollback point; do not merge this acceptance-only Proxy into Production.

## Validation before cloud
- New dedicated guard test `scripts/test-mi-next16-writable-qa.cjs` passed **54** assertions without network access.
- Hosted isolated registry test **23**, private branch Git read/write mock **1**, local Make guard **14**, plus prior membership/editorial/scanner/one-click regression suites.
- Existing authenticated local E2E tests: editorial review queue 41, scanner 24, one-click VIP 28, broader editorial admin 95; no real Telegram, no live membership or public changes.
- Next.js 16.4.6 compiled and passed TypeScript checks across all routes; npm production audit to be recorded after latest build.

## Phase gates
1. Commit & verify Git bundle of this test branch, preserving all original V1.35/Next16 and original sandbox recovery points.
2. Publish isolated test branch. Its first Vercel build should fail closed until branch-specific Preview overrides exist.
3. Configure fresh Preview variables: `CM_QA_WRITABLE_SANDBOX=true`, `MI_EDITORIAL_MODE=preview`, `MI_MAKE_HOSTED_QA=true`, `MI_EDITORIAL_QA_BRANCH=v135-next16-test-20261126`, `MI_MAKE_DESTINATION=TEST_ONLY`, `MI_MAKE_TEST_ENABLED=false`, `CM_QA_SEND_WINDOW=CLOSED`, `CM_QA_TEST_CANDIDATE_ID` pinned above; synthetic administrator password; sandbox-only scoped Git token; `MI_MAKE_WEBHOOK_URL=DISABLED`, no Make API key, no service-role key; invalid sentinel Supabase URL, disabled Google Script endpoint, disabled public chart PIN. New variable scopes must not modify existing variables for Production or any earlier Preview.
4. Verify cloud GET, Vercel SSO and HTTP 403 on all forbidden writes; authenticate with separate synthetic QA credential, edit ONLY pinned candidate in new Git sandbox and verify persistence. This is not a Telegram send.
5. If cloud edit QA and Make inactive/queue/ledger read-only checks pass, create a narrowly controlled single message window and verify true Make → TEST Telegram receipt. Immediately deactivate Make, disable sending, retire immutable send-enabled Preview URL, verify no replay, and save new restore point.
6. A public/VIP Production release is a separate approval and independent security-review stage.

## 26 November 2026 — verified offline full receipt acceptance
- Added `scripts/test-mi-next16-synthetic-receipt-e2e.cjs`, an independently executed **local-only** website-to-Make receipt test with no real network transmission to Make or Telegram.
- Starts the actual Next.js 16 production-style server on loopback with a random local-only administrator password and disposable source/queue copies derived exactly from private Git SHA `b9742a9c730acf7580371a54c6fe828b3dbcd955`.
- Injects a Node preload shim to intercept **only** `hook.eu2.make.com` traffic before it leaves the process; validates TEST_ONLY payload, returns a structurally correct synthetic signed-by-nobody Make acknowledgement with test message ID `909` (this ID is purely synthetic and is NOT a real Telegram message).
- **14/14 HTTP assertions passed**: private editor authentication, original six candidates, one selected unsent Glassnode candidate, exact single Make-stub dispatch, reservation and sent receipt persistence, original real message #9 retention in a disposable copy, two historical unknown reservations preserved, and second attempt to send the same candidate rejected without a second outbound call.
- Verified no real Telegram messages, no Make network requests, no real membership changes, no production editorial registry writes and no lasting queue changes. All disposable local files and test server were cleaned up.
- Separately, Vercel project has **13 branch-scoped Preview-only overrides** for this branch; all outbound integration settings are disabled, real Supabase connection is replaced with a non-routable test value, and the synthetic QA login is stored in the Vercel sensitive setting. The synthetic login credential has a locally DPAPI-protected backup in the owner Windows profile; neither the value nor any GitHub token is included in Git or this report.
- **Cloud blocker**: existing `MI_EDITORIAL_GITHUB_TOKEN` for the older test branch is a Vercel Secret; Vercel intentionally does NOT reveal or copy its value to another branch. Therefore the *new* branch still needs a freshly scoped GitHub fine-grained PAT with Contents read/write access restricted to `CryptoMainlyLee/cryptomainly-editorial-sandbox`, entered directly into **Vercel → cryptomainly-portal → Environment Variables**, key `MI_EDITORIAL_GITHUB_TOKEN`, scope **Preview, branch feature/mi-v135-next16-writable-test-2026-11-26 only**, type Secret/Sensitive. Never paste it in this chat and never reuse the Production editorial registry token. After creation, redeploy the new Preview and validate authenticated read/write. Make remains INACTIVE and send disabled.
- No Next.js 16 actual hosted Telegram send has yet occurred. All release claims must continue to distinguish this synthetic success from the previously verified real message #9 on Next.js 14.
