# Market Intelligence V1.32 — Scan-to-Queue intake

20 November 2026. Feature branch `feature/mi-scanner-batch-intake-2026-11-20`; base `e6867c0d24dbbba3c30c6186e279ef9c8100f009`.

## Functional scope
An owner-authenticated **batch intake** in `/admin/market-intelligence/queue` accepts a complete, schema-checked JSON report produced by the existing Chart Scanner. This is NOT an unattended cloud delivery path. Only the logged-in editor can submit; no new public POST route or shared scanner secret is created.

Up to 12 unique original research links are accepted per import. Both first-party X posts and specifically allowlisted provider-owned research pages (Glassnode, CryptoQuant, CoinGlass) may enter the **Candidate** queue. Provider nominations remain ineligible for final approval until officially approved on the 14-account roster, and date-only items are still blocked from approval until an exact UTC time is independently established.

The import preserves each candidate's source URL, author, type, market, title, summary, why-it-matters, limitations, original timestamp or date, edition day and provisional editorial score. **All six evidence attestations are always FALSE; status is always candidate; VIP highlight is always FALSE.** The scanner cannot send approval/evidence/publish flags; extra input keys cause rejection.

## Validation / idempotency
- Input must use exact `cryptomainly-scanner-review-intake-v1` schema with an allowed `scan_id`, ISO UTC run timestamp (maximum 3 days old, no future), registry SHA matching the CURRENT online-editor registry, and 1–12 items.
- Canonical original `https://x.com/<handle>/status/<id>` or allowlisted provider-owned HTTPS article; matching author/account, no tracking params. Original source date max 336 hours old, no future.
- Historical public archive URLs rejected; duplicates within a batch rejected. Already-queued links are skipped **without overwriting edits or approvals**. No partial batch write if a different candidate fails validation. Concurrent editor version checks fail closed.
- Existing admin cookie + CSRF, strict same-origin, bounded 32 KiB form body and 24 KiB JSON text, server-side protected GitHub queue file, Git version/CAS audit and immutable record changes.
- Successful submission shows added count and duplicates; current live source registry is never mutated. No GitHub access token exposed to the scanner or a frontend.
- The existing 8 KiB POST limit for all other admin forms stays unchanged.

## Scanner handoff requirements
The existing cloud research task should output this structured payload **only when it has actually found source-confirmed items**. Use raw JSON inside a code fence for easy copying; don't include unverified posts as verified, don't invent UTC timestamps or estimated levels. Include provider original research as nomination candidates only and preserve uncertainties. If no original link and source date can be determined, report an unverified lead separately, not within the intake payload. No automatic website, Make or Telegram posting is authorized.

Schema illustration (PLACEHOLDERS, NOT A REAL SCAN; never import this):
```json
{
  "schema":"cryptomainly-scanner-review-intake-v1",
  "scan_id":"CM_RESEARCH_20261120T2200Z",
  "generated_at_utc":"2026-11-20T22:00:00.000Z",
  "source_registry_revision":"<current 64 lowercase hex hash>",
  "items":[{
    "kind":"technical",
    "market":"crypto",
    "url":"https://x.com/<approved_handle>/status/<original_id>",
    "source_handle":"<approved_handle>",
    "title":"Clear headline at least twelve characters",
    "summary":"Original verified source data or chart summary with exact observed facts.",
    "why_it_matters":"Market significance and risks, not a trading recommendation.",
    "limitations":"What has not been proven or what could invalidate the interpretation.",
    "published_at_utc":"2026-11-20T19:00:00.000Z",
    "edition_date":"2026-11-20",
    "score":84
  }]
}
```

## Not implemented by this release
- Fully unattended cloud scanner-to-queue delivery, secure Google Apps Script-to-Vercel webhook, or automated content fetching. The scanner still reports within ChatGPT.
- A public mixed-format edition producer, image generator, or new daily archive publisher.
- Telegram send, Make webhook activation, automated VIP highlights or automatic approvals.

## Acceptance / release
- Next.js v14.2.33 production build; no TS errors.
- V1.32 pure scanner intake: 23 PASSED.
- V1.32 authenticated HTTP E2E: 24 PASSED, using synthetic research and isolated private files, including CSRF, origin, 32 KiB limit, no-read anonymous and duplicate replay.
- Existing V1.30 queue/source/admin regression suites rerun.
- Tested staging production build should be created with `autoAssignCustomDomains=false`; verify original source registry SHA and 6 candidate data preserved, do NOT automatically publish.
- Maintain immutable Git release bundle and old deployment id for rollback.

## Later cloud automation design (not yet authorized to claim operational)
Zero-cost bridge candidate: let scheduled scanner write machine-readable candidate batches to a new restricted Google Sheet `Scanner Intake` tab via its connected OAuth, then have a bounded Apps Script 15-minute trigger sign a POST to a dedicated Vercel handler using a secret kept separately in Script Properties and Vercel Production env. Authenticate HMAC with anti-replay identifiers and max age, compare current canonical roster digest, Git optimistic SHA version, and hard-code unapproved-only writes. Do not put HMAC secrets into ChatGPT automation instructions, public sheets, URL parameters or browser JavaScript. Test first against an isolated sandbox repository and private Telegram test chat, without contacting VIP.
