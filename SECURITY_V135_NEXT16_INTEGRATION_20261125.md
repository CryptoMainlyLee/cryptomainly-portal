# CryptoMainly V1.35 + Next.js 16 — isolated integration (25 Nov 2026)

## Scope / immutable baseline
- This worktree started from verified clean V1.35 feature SHA `bf97f0b08f00bdd4ef230eccabbdbdda7b3ef89c`, branch `security/mi-v135-next16-integration-2026-11-25`.
- Applied the separately tested Production-baseline security migration `ec746360cb5b1dab75e76e7b66d38ef99630bc4c`, with one manually reviewed conflict: retained V1.35's private TEST Group labeling and adopted Next.js 16 awaited `searchParams`.
- No GitHub push, no Vercel Preview or Production deployment, no Supabase/member writes, no Make/Telegram outbound requests.
- Existing TEST Group was previously verified by message #9 with V1.35 running on Next.js 14. **This new Next.js 16 integration has NOT yet done a new hosted Make/Telegram delivery.** Never claim otherwise.
- Private Git editorial sandbox and its two locked uncertain records remain separately preserved; no send retries were performed.

## Versions and safeguards
- Next.js `16.4.6`, React/ReactDOM `19.3.1`; lockfile installed reproducibly with `npm ci`.
- Updated dynamic `params`, `searchParams`, and `cookies()` to asynchronous request-time APIs while retaining existing app policies, trusted-origin and CSRF checks, TEST-only pinning and outbound reservation/no-replay logic.
- `MI_MAKE_TEST_ENABLED` was explicitly FALSE during local smoke; all tests used synthetic-only local administrator password. Servers stopped and process environment restored.
- Branch remains local-only until reviewed for cloud Preview security isolation.

## Acceptance evidence
- `npm run build` PASSED: Next.js 16.4.6 Turbopack + TypeScript and all original application routes.
- `npm audit --omit=dev`: ZERO known production dependency vulnerabilities (critical/high/moderate/low all 0).
- `npm audit`: 3 moderate development-only transitive TailwindCSS → Sucrase → glob/minimatch advisories, no critical/high.
- V1.35 isolation and private Git read/write mock, VIP one-click/no-duplicate, shared administrator password, CSRF/origin, membership safeguarding and scanner intake: **17/17 test groups PASSED**. One legacy V1.32 synthetic mock needed an added `./hosted-qa` import stub; no scanner business code changed.
- Local combined branch HTTP smoke **11/11 PASSED**, including anonymous outbound `/admin/market-intelligence/queue/send` blocked with HTTP 401.
- Local combined branch read-only funding/market/widget/chart tests **7/7 PASSED**, including real live derivatives funding API read (no trading and no mutation).
- Existing Next.js 16 ESLint flat config exposes historical lint debt (152 errors/16 warnings in the Production-baseline upgrade, including older `require`, explicit `any`, and React hook rules). Full integrated ESLint compliance is not yet certified; do not equate build success with lint clearance.

## Release gates
1. Preserve both Next.js 16 security baseline and V1.35 integrated branch Git bundles, original V1.35 snapshots and private editorial sandbox backups.
2. Review remaining three moderate dev advisories and lint findings; avoid breaking Tailwind/React or membership code purely to silence warnings.
3. If proceeding with Vercel cloud QA, first verify Preview branch environment variables, state isolation and sending OFF; test authenticated access without live member mutations or Make sends.
4. Only after validated cloud QA should a separate planned Production release be considered. Actual VIP chat cutover and Make scenario activation require explicit separate approval.

Last independently verified Production Vercel deployment: `dpl_7Fyai7GqvW61BpaDa1gUi1aoQ3iD`, SHA `045ddd1ed2a7fdc8a2d62baec72e3406b340ff57`; unchanged.

## 26 November 2026 — cloud QA fail-closed preflight
- Isolated branch retains previously verified Next16 scanner functionality and message #9 historical test evidence only. Never reuse the original send-enabled Preview URLs.
- Added root `proxy.ts` for the exact branch `security/mi-v135-next16-integration-2026-11-25`; with matching `CM_SECURITY_QA_READ_ONLY=true` and `VERCEL_ENV=preview`, only GET/HEAD are permitted. All POST/PUT/PATCH/DELETE/OPTIONS (membership, Telegram, editorial, Google Sheets, server actions, login mutations) return HTTP 403. Inconsistent branch/environment/flag combinations return HTTP 503.
- Added `scripts/verify-mi-next16-security-preview.cjs` to `prebuild`; cloud build refuses unless the exact Preview branch and repo identifiers, read-only flag, disabled Make/editorial modes, disabled Sheets/Make endpoint, invalid sentinel Supabase URL, QA-disabled chart PIN and branch-specific synthetic administrator password are present. Real Supabase service key, editorial GitHub token and Make API key must be absent.
- Added pure `scripts/test-mi-next16-preview-readonly.cjs`; 24 safety checks passed. Next16 build passed with Proxy compiled. Nine targeted original security and delivery tests passed sequentially (including no-real-send E2E).
- Existing Vercel project had shared Preview variables including CM_ADMIN_PASSWORD, SUPABASE_URL, MI_MAKE_WEBHOOK_URL, GOOGLE_SCRIPT_URL and NEXT_PUBLIC_CHART_PIN. Branch-specific overrides must be set before a successful QA deployment.
- Vercel API will not accept branch-specific environment variables until the branch exists in the connected Git repository. Correct safe sequence: push this guard-only Git feature branch; allow initial prebuild to FAIL CLOSED without the overrides; then create exact branch-scoped Preview overrides and redeploy. No Production branch change, no VIP Telegram sends, and no real member writes permitted.
- Unique synthetic QA password generated with Windows cryptographic RNG and stored ONLY as a DPAPI-protected user-local file under `%LOCALAPPDATA%\CryptoMainly\SecurityQA\V135-Next16-Preview-Admin.dpapi`. Do not copy or print its contents; it is not a real CryptoMainly/VIP password.
- Remaining release gates: verify effective Vercel branch env and deployment state; smoke GET and ensure POST 403; keep Make inactive and Production unchanged; collect independent evidence before considering any future live release.

### 26 November 2026 — Vercel Preview branch bootstrap
- Branch guard source `72d3ecfd8a303eef82ca329d1883bb4e68fd8df2` pushed to GitHub branch `security/mi-v135-next16-integration-2026-11-25` (NOT main). Verified restore bundle `cryptomainly-v135-next16-readonly-preview-prepush-20261126.bundle`: 6,132,515 bytes, SHA256 `1C84A34DEFFC61E4C0CF02C7EB909E88F87E8DF8E027DC127F612B485844E7B8`.
- The first automatic Vercel Preview deployment `dpl_5YUe5W3WoMQuzvz4Hu6yLivobwHw` intentionally FAILED at the prebuild guard: `Security QA build refused` (10 absent branch-specific vars); no running Preview app created, no Production change.
- Now 10 exact branch-specific Preview environment overrides exist, distinct from shared Preview variables. Names: CM_SECURITY_QA_READ_ONLY, MI_EDITORIAL_MODE, MI_MAKE_TEST_ENABLED, MI_MAKE_HOSTED_QA, MI_MAKE_DESTINATION, MI_MAKE_WEBHOOK_URL, GOOGLE_SCRIPT_URL, SUPABASE_URL, NEXT_PUBLIC_CHART_PIN, CM_ADMIN_PASSWORD. Values are gated server-side to read-only, off, false, DISABLED, and non-routable QA URL, with a separate randomly generated synthetic administrator credential (not the real password; do not display values).
- Root `proxy.ts` allows only GET/HEAD on the exact QA branch and denies POST/PUT/PATCH/DELETE/OPTIONS with HTTP 403; incompatible deployment configuration yields 503. Preview GET headers include `X-Robots-Tag: noindex, nofollow, noarchive` and `Cache-Control: no-store`. Public Production branch is not affected by this feature branch.
- NEXT: verify a fresh guarded Vercel Preview deployment and smoke GET/write-denial; do not send Telegram or mutate real membership records. Legacy Next16 framework upgrade's historical lint debt and 3 moderate dev-only npm advisories remain separately documented.
