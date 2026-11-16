# CryptoMainly Market Intelligence — V1.12 Private Release-Gate Review

Date: 16 November 2026 (UK). Feature branch ONLY. NO production rollout.

## Work performed
- Added authenticated, read-only review route:
  `/admin/vip/market-intelligence`.
- Route reuses the existing scoped VIP admin cookie as an authorization
  check, without altering the VIP membership auth module or any member data.
  A separate, stronger editorial approval/write authentication and durable
  audit store are required before any future online one-click write action.
- Admin route exposes the original observation IDs and build-time visibility
  only after server-side `hasAdminSession()` succeeds, and does not render any
  form, mutation route or browser-side admin write API.
- Preserved existing public pages and static per-edition URLs; no new publish
  or Telegram buttons.

## Evidence tested (local production-style Next.js 14 build)
- `npm.cmd run build` passed; route is dynamic, not prerendered as static HTML.
- Unauthenticated GET returned HTTP 307 redirect to `/admin/vip/login`
  without any original observation IDs or protected titles.
- Authenticated GET with a disposable local synthetic admin session
  returned HTTP 200; all 7 historical editorial observations displayed.
- No admin write forms in rendered HTML; robots noindex.
- Edge browser visual QA at 1280 × 800 and 390 × 844:
  correct authenticated layout, no horizontal overflow, no write UI,
  seven original X links. QA PNGs are local-only.
- An original first-party archive share screenshot was rendered locally as
  a 560,385-byte, 1100 × 1306 PNG, with four preview cards, four original
  links and correct dated archive metadata.
- `private_delivery_rehearsal_v112.py` uses a synthetic approved TEST-ONLY
  fixture and an IN-MEMORY fake Telegram receiver (NO network/webhook):
  verifies screenshot signature/dimensions/hash, exact private chat ID,
  destination/approval/caption gates, retry after pre-send failure,
  duplicate replay rejection and concurrent single-send reservation.
- Historical Make scenario ID 10173567 was READ-ONLY inspected:
  still INACTIVE; previous successful private runs and duplicate checks
  are present in Make history. No additional credits were spent.

## Explicitly NOT proven by this rehearsal
- An actual fresh private Telegram message for V1.12 was NOT sent.
- It does not prove the production Make scenario has the same atomic
  pre-send reservation guard as the local fake. Current Make path is:
  webhook → approval → lookup existing record → duplicate filter →
  Telegram photo → add sent-record. If Telegram succeeds but sent-record
  write fails, a replay may double-send. Release BLOCKER.
- Latest cloud research cannot yet consistently verify real original X
  post media and full thesis; do not infer synthetic fixtures are trade
  setups. No new edition is approved.
- The protected admin page is READ ONLY. User-initiated withdrawal can be
  staged in the existing local editorial panel, with reviewed deployment,
  but there is no safe hosted one-click deletion backend at this stage.
- Old public PNGs/previous CDN versions may survive a removal until
  deliberately reviewed and removed; Git history is separate.

## Mandatory next gates before real site publishing
1. Confirm complete source verification, 336-hour freshness, author,
   chart media, original X links, copyright and UK financial promotions.
2. Design and test safe Make idempotency including Telegram-success/
   ledger-write-failure, with manual reconciliation of unknown send outcome.
   Never suppress a real delivery error by silently marking it 'sent'.
3. Test approved synthetic payload in the existing PRIVATE test chat only
   under an explicit reviewed Make test; no public VIP destinations.
4. Confirm owned public image bytes exactly match staged approved PNG;
   validate screenshot does not reproduce withdrawn posts.
5. Audit live-admin auth/rate limits, separate editorial role, CSRF,
   origin verification, access log and durable moderation audit storage
   before enabling any write API. No Supabase/member schema reuse.
6. Review Git diff, tests, private QA visuals, backup, Vercel preview,
   live route/screenshot takedown behaviour, then separately authorise
   production promotion or a published edition.

No automated trades, membership changes, cost-incurring API calls,
production website deployments or new Telegram posts were performed.
