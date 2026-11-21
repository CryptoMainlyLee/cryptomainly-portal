# CryptoMainly V1.35 — isolated hosted Preview acceptance
Date: 21 November 2026. **QA only. No VIP or public-domain cutover authorised.**

## Immutable identities
- Website repository: CryptoMainlyLee/cryptomainly-portal
- Website feature branch: `feature/mi-web-one-click-test-2026-11-21` (never main)
- Vercel project: `cryptomainly-portal`; target: Preview only; deployment protected by Vercel Authentication
- Private editorial repository: CryptoMainlyLee/cryptomainly-editorial-sandbox
- QA editorial branch: `v135-hosted-web-e2e-20261121` — contains six test candidates, no deliveries
- Make scenario: 10208938, manually run once, remains INACTIVE
- Make private hook ID: 4532720; private dedup datastore ID: 210729
- Telegram TEST chat: -1004432697280 only; actual VIP chat -1001694306052 is NEVER permitted

## Runtime safeguards
- `hostedQaIsolated()` demands Preview, `VERCEL=1`, exact Git repository, exact website branch, explicit `MI_MAKE_HOSTED_QA=true`, `MI_EDITORIAL_MODE=preview`, and exact QA registry branch.
- Both source registry and editorial queue use the same branch of the private sandbox repository; not `main`, not production-registry.
- All live publishing still needs `MI_MAKE_TEST_ENABLED=true` AND `MI_MAKE_DESTINATION=TEST_ONLY`, valid pinned Make URL, secret API key, owner login and CSRF plus confirmation. Real VIP destination is never passed to Make.
- Default `MI_MAKE_TEST_ENABLED=false` Vercel branch setting protects from accidental sends.
- Original Production mode, membership bot and public site are unchanged. Plain Preview outside exact QA branch cannot send.

## Vercel Preview environment variables
Created and scoped ONLY to the website feature branch:
- `MI_EDITORIAL_MODE=preview`
- `MI_MAKE_HOSTED_QA=true`
- `MI_EDITORIAL_QA_BRANCH=v135-hosted-web-e2e-20261121`
- `MI_MAKE_DESTINATION=TEST_ONLY`
- `MI_MAKE_TEST_ENABLED=false`

**Missing secret configuration for completing authenticated hosted E2E:**
1. A sensitive branch-scoped `MI_EDITORIAL_GITHUB_TOKEN` granting only read/write to the private sandbox repository (not the real editorial registry). Older v119 Preview secret could NOT be copied through the protected Vercel API; never broaden its scope or reveal it in chat.
2. A sensitive branch-scoped `MI_MAKE_WEBHOOK_URL` identifying the exact isolated Make hook.
3. A sensitive branch-scoped `MI_MAKE_WEBHOOK_API_KEY` matching that isolated hook. Never paste any of these in a chat or store in Git.
4. Only after validating 1–3, set branch-only `MI_MAKE_TEST_ENABLED=true`; redeploy exact Preview branch; re-verify no Production environment received a Make variable.

## QA so far
- 23 dedicated preview-branch isolation tests passed.
- 14 localhost TEST-only tests passed.
- 40 Make transport and receipt security tests passed.
- 1 mocked sandbox GitHub GET/GET/PUT sequence passed with no network calls.
- 28 authenticated website/browser/security tests passed.
- Next.js production build passed.
- Earlier local website -> Make -> Telegram end-to-end confirmed test message ID 8; real editorial registry and queue unchanged.
- Preview deployment created READY on Vercel; hosted end-to-end not yet run, because secret environment and private store access must be configured first.

## Hosted acceptance sequence (no automatic real messages)
1. Verify exact branch commit, new Preview URL, Vercel SSO and no public custom-domain alias.
2. Confirm private editorial queue reads six test candidates from `v135-hosted-web-e2e-20261121`; confirm other branches and production registry unchanged.
3. Confirm owner login and CSRF rejection; edits persist only in test branch.
4. Arm **inactive** Make scenario via single `Run once`; never activate recurring runs.
5. Use ONE labeled synthetic test candidate and the owner's one confirmation; inspect exact receipt `schema=cryptomainly-make-delivery-receipt-v1`, `status=sent`, exact delivery ID, `TEST_ONLY`, test Telegram chat and positive message ID.
6. Independently inspect the test Telegram group, Make execution log and dedup ledger; ensure no second message on duplicate attempt; no automatic retries.
7. Keep public-domain deployment, real VIP destination, membership and production editorial state untouched; preserve restore snapshots and a final Vercel env/alias audit.
