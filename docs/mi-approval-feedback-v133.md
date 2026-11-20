# CryptoMainly Market Intelligence — Approval Feedback Repair V1.33
Date: 20 November 2026
Scope: user reported `/admin/market-intelligence/queue?error=save` after clicking `Mark review-approved (NOT publish)`.

## Confirmed root cause
The six real scanner candidates in the private editorial repository are all `candidate`, with **0 of 6 evidence attestations** recorded. The backend correctly refuses an `approve` action until all six checks, editorial score ≥80, exact UTC source timestamp (not calendar date alone), freshness ≤336 hours and approved source roster have been satisfied. The generic `?error=save` message made this normal rejection look like a database failure. No data loss or approval occurred.

## UI / behavior correction
- Add a shared server-side `approvalBlockers(item, sourceRoster, now)` function so backend approval validation and UI expectations use one consistent set of checks.
- Display the exact missing requirements beside every `candidate`, with clear instructions to use `Edit details and evidence`, record only genuinely verified checks and save edits.
- Disable the approval button until its verified requirements are fulfilled; label it `Complete evidence checks before approval` while blocked. Note that this controls only internal approval, not public publishing.
- If an old browser tab attempts the approval POST anyway, return `?error=approval` and a specific helpful message. Preserve `?error=stale` for concurrent queue updates. Maintain generic failure feedback for unrelated save issues.
- Glassnode and CryptoQuant remain unapproved source nominations; their verified date-only article entries require exact UTC publication time and source-roster approval. No provider was added to the live source registry.

## Security and QA
- No credentials read or output.
- No private queue mutations, member data changes, Telegram messages, or changes to public editions.
- Next.js production build successful.
- Existing pure queue tests: 32 passed.
- Authenticated queue E2E: 41 passed (3 additional UI/blocker checks).
- Scanner batch pure+HTTP tests: 23+24 passed.
- Shared admin password 11, origin 13, original editorial E2E 95, private hosted adapter 25, bridge 16 passed.
- Total automated tests: **280 passed** across those suites; no failures.
- Existing production staging/promotion and rollback precautions required. Keep auto-assignment off, build exact commit on production-target staging, verify both admin/public routes, only then promote and confirm live alias matches.
- Preserve restore bundle before promotion and verify output hashes.
