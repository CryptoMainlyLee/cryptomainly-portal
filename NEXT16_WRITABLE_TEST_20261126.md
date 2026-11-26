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
