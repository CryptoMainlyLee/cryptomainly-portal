# CryptoMainly MI — protected editorial queue V1.30
Date: 20 November 2026. Branch: feature/mi-editorial-review-queue-2026-11-20
Base: 10722c156c41e3983fec0f8896c0c141c17866f4 (live shared admin password).
Status: SECURITY-TESTED FEATURE BRANCH. NOT PROMOTED TO PUBLIC WEBSITE. NO AUTOMATED PUBLISHING.

## Purpose and scope
Separate editorial decisions for PRICE CHART RESEARCH and DATA-DRIVEN ON-CHAIN/QUANTITATIVE INSIGHTS.
Owner requested:
1. A scheduled daily verified edition eventually published to the existing Market Intelligence website with a preview image and one Telegram VIP link post.
2. Optional separate highlighted research posts, first via manual owner approval and later potentially narrowly automated.
This release lays the protected internal review groundwork; it does NOT yet deliver either outbound publication flow.

## What V1.30 actually implements
- New authenticated admin route: /admin/market-intelligence/queue
- Internal edition preview: /admin/market-intelligence/queue/preview/YYYY-MM-DD
- Single administrator password CM_ADMIN_PASSWORD shared with VIP Admin; separate cookies/session/permissions.
- Add/edit/reject/reopen research candidates; evidence flags; review-approve; optionally nominate a VIP highlight; create text-only VIP draft for manual review/copy.
- Independent private storage file editorial-queue-v1.json in the *same existing isolated editorial state repository*, separate from source-registry.json; Preview and Production repo tokens remain isolated.
- All changes authenticated by strict session/CSRF/same-origin security, bounded form reads, optimistic file SHA concurrency and immutable audit action reason. Only first-party HTTPS original X status or supported official research-domain articles accepted.
- Original X author must match the post URL and be currently present on approved live roster to mark review-approved. Named provider-owned research articles (Glassnode / CryptoQuant / CoinGlass) likewise require prior owner approval of their official X handle before advancing beyond candidate.
- Provider-original articles with a verified DATE but no independent exact UTC TIME may enter as **candidate** using YYYY-MM-DD. They are visibly labelled 'Exact UTC time pending' and **cannot** be approved until an exact UTC timestamp is confirmed. Never fabricate a midnight timestamp.
- The six human-evidence attestations (original, publication UTC, inspected visual/data, methodology, rights, UK compliance) and editorial score >=80 must all be supplied before 'review-approved'. This is NOT independent machine proof of legal rights; the human reviewer must actually confirm them.
- 14-day source freshness, strict original-source URLs, duplicate original link and historical-edition dedup, source removal revalidation at daily-edition plan time, stale item exclusion, editing resets approval and highlight flag, rights/invalidation must not be invented.
- No storage or API for Telegram, Make, public publication or membership manipulation is called.
- Confidential new file is never exposed through public registry endpoint; public old editions unchanged.

## Explicit unfinished components / next release gates
A. Cloud scanner ingestion to queue: new authenticated bounded signed intake, one-run freshness and idempotency protocol and E2E demonstration working without the user's laptop. Scanner currently reports in ChatGPT; it does not auto-populate queue.
B. Mixed-format edition builder: new public edition data schema, explicit content moderation, original source embed rights, poster image generator and dated archive, atomic rollback and nightly actual run acceptance.
C. Daily release policy: final owner-approved quality threshold, 5-9 short edition exception, publisher authority, verified chart/date/source gates, hard stop for empty findings. Do not publish mere empty scan.
D. Telegram Make integration: website link + preview delivery to private test chat first; exact duplicate rejection; later owner-authorized controlled VIP group cutover. No unattended VIP publication yet.
E. Optional Phase 2 automatic highlights: only after sufficient manual samples, rate limits and revocation/emergency stop with clear owner consent.
F. Production rollout requires an authenticated staged-production review, private repo queue file backup, exact deployed SHA check, and a separate manual domain promotion. GitHub main remains unchanged.

## Acceptance completed locally
- npm run build (Next.js 14.2.33, no type errors).
- New pure storage/approval tests: 30 PASS (no network).
- New Next.js end-to-end localhost test: 38 PASS; synthetic isolated admin password + disposable local files, zero Telegram calls.
- Existing shared admin password: 11 PASS.
- Origin security: 13 PASS.
- Existing old-editor E2E: 95 PASS.
- Existing hosted adapter mocks: 25 PASS.
- Existing Google scanner bridge mocks: 16 PASS.
Total documented local security/integration checks: 228 PASS; no paid tools, no live membership, no real Telegram sends.

## Important operational note
Stage a production-configured Vercel build with autoAssignCustomDomains=false and keep www.cryptomainly.co.uk on its existing verified deployment. Preview login must use the current shared admin password but must not leak or duplicate it. New private queue storage file may be absent; read-only displays should be empty without creating it. Do not seed real production queue with synthetic test candidates. Before any live release, inspect latest deployment and verify the new file does not interfere with source-registry.json.
