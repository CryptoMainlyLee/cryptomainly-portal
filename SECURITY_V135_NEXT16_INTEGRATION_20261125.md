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
