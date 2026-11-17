# V1.19 secure online editorial controls — 17 November 2026

Status: isolated development/preview only. No production merge, no membership schema or authentication changes, no Telegram action, no source roster change.

## Architecture
- New independent editor at /admin/market-intelligence. Existing VIP review remains read-only and links to it.
- Separate cryptographically random editorial access key (32-byte base64url generated out-of-band), signed one-hour session, HTTP-only Secure SameSite=Strict path-scoped cookie; constant-time match, per-session CSRF token, exact trusted Origin, confirmation, bounded POSTs, validation and compare-and-swap revisions. Logout clears browser cookie; stolen session remains valid until expiry or secret rotation. Durable per-IP rate limiting and session revocation policy must be reviewed before production.
- Source add/edit/remove and seven-day priorities maintain existing canonical roster SHA256, source schema and schedule. Minimum one source. Edits affect one state document; source revision hashes roster data only, full file version protects moderation and audit changes.
- Public latest/archive pages now server-render dynamically. Dated PNG moved out of public assets; guarded route refuses all dated shares for an affected edition, even when only a single post is withdrawn, until fully restored or a separately approved replacement is implemented. Prebuild rejects public Market Intelligence PNGs. Prior deployment URLs, cached copies, Git history and Telegram remain outside this takedown boundary.
- State is a single versioned JSON document with editorial_visibility and editorial_audit. Public-safe reason codes only (no confidential notes, no member data); audit retains 100 recent events with Git history as longer record. GitHub provider uses exact repository/path/branch and GitHub contents SHA checks.
- **Do not grant a repository write token for the membership website repository.** Dedicated state-only GitHub repos: CryptoMainlyLee/cryptomainly-editorial-sandbox (private test), CryptoMainlyLee/cryptomainly-editorial-registry (public roster). Both presently unprovisioned. Use distinct fine-grained, repository-specific credentials, contents read/write only. No token value in code, chat, logs or backups.
- Hosted state modes: off (read-only snapshot, preview only), preview (sandbox repository only and VERCEL_ENV=preview), production (registry repository only and VERCEL_ENV=production); local test mode is isolated and prohibited on Vercel. Production without explicit production mode fails closed for market intelligence.
- Before enabling writes: initialize each separate repo from validated seed plus explicit editorial_visibility and editorial_audit, configure sensitive variables MI_EDITORIAL_ACCESS_KEY, MI_EDITORIAL_MODE and MI_EDITORIAL_GITHUB_TOKEN in separately scoped Preview/Production environments, review actual backend read/write/revision tests. Do not reuse membership credentials. Monitor GitHub API rate limits and Vercel function usage; no new paid service authorized. Current canonical orphan branch registry remains untouched. The scheduled scanner must switch to new public URL only after verified fetch and approved migration; retire legacy local publisher's write path then to prevent divergence.
- API read failure/malformed state: public research withheld, image 503, admin refuses changes. No auto-retry after uncertain writes; reload and reconcile.
- Current asset whitelist contains the sole existing 15 Nov PNG; future approved editions require updating the guarded image allowlist and bundling private media. No automatic edition publication.

## Evidence
- Production-style Next.js build passed, routes dynamic; private PNG included in route trace, absent in public assets.
- scripts/test-mi-editorial-v119.cjs: 75 assertions passed against disposable local JSON and real HTTP server. Includes real login/cookie, wrong/cross-origin/forged sessions, CSRF, confirmation, stale revision, account add/edit/remove, priority cleanup, unchanged canonical roster hash, individual/whole edition 404/visibility, RSC non-leakage, guarded PNG, seven successful audits, malformed-state fail closed, logout.
- No external GitHub writes exercised with a privileged hosted token; no production release authorized.
- First real private Telegram delivery and replay separately verified at V1.18, not part of this feature. Remain inactive.
- Existing stable production main unchanged 1d9645e3ab77481415154166888d12c3909990ee. The repair redeployed that exact commit; do not rollback to a deployment missing Production Supabase credentials.

## Test commands
npm.cmd run build
node scripts/test-mi-editorial-v119.cjs
