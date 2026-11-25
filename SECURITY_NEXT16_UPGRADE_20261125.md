# CryptoMainly — isolated Next.js 16 security migration (25 Nov 2026)

## Scope and safeguarding
- Branch: `security/next16-upgrade-2026-11-25` in a dedicated Git worktree, based **exactly** on the last verified deployed Production commit `045ddd1ed2a7fdc8a2d62baec72e3406b340ff57`.
- No changes to `main`, to Vercel Production, to membership records, Make.com, or Telegram.
- This is the **Production-baseline framework migration**, not yet a merge of the separately verified V1.35 feature branch (`bf97f0b08f00bdd4ef230eccabbdbdda7b3ef89c`).

## Dependency and framework changes
- Next.js `14.2.33` → `16.4.6`; React and ReactDOM `18.3.1` → `19.3.1`.
- Updated React types, ESLint 9, eslint-config-next 16, PostCSS, and lockfile.
- Migrated async `cookies()`, dynamic page `params`, `searchParams`, and dynamic route handler parameters without altering authentication policies or business logic.
- Added explicit Next.js ESLint flat configuration, because `next lint` was removed in Next.js 16.
- Next.js 16 itself updated the TypeScript configuration and generated type reference.

## Verified tests
- `npm run build`: PASS, Next.js 16.4.6 production-style Turbopack build and TypeScript checks, all 34 routes compiled.
- Existing security, membership, editorial and private Telegram regression tests: **14/14 groups PASS**, including 95 synthetic editorial E2E checks and zero actual Telegram sends or real membership changes.
- Isolated local HTTP smoke: **11/11 PASS** using an ephemeral synthetic administrator password; anonymous Telegram-send POST returned 401. The server stopped and test password was discarded.
- Read-only market data / layout smoke: **7/7 PASS**, including derivatives funding, labels, CoinGecko attribution and chart/widgets layout. The server stopped afterward.
- `npm audit --omit=dev`: **0 critical, 0 high, 0 moderate, 0 low** (no known Production dependency advisories).
- `npm audit` (including dev tools): after non-breaking audit fix, **3 moderate**, 0 critical/high. Remaining chain: TailwindCSS 3.4.4 → Sucrase 3.35.0 → glob 10.5.0 → minimatch 9.0.9. Do not force a breaking major glob override without dependency/API tests.
- `npm run lint`: not clean; baseline legacy code/test scripts produce **152 errors and 16 warnings** under the newly introduced Next.js 16 ESLint rules. Leading categories are existing CommonJS require imports (73), explicit any (47), effects (18), HTML navigation warnings (6). This is a known lint debt; do not claim lint passed.

## Remaining pre-release work
1. Integrate the clean V1.35 feature snapshot into a separate security integration worktree, preserving independent private sandbox and TEST-only no-replay safeguards.
2. Run the full Next.js 16 build, security tests and local HTTP smoke on the integrated tree.
3. Review lint debt and the residual development-only dependency advisories; avoid unnecessary risky refactors.
4. Verify Node runtime compatibility in Vercel Preview, deploy a send-disabled private Preview **only after isolation checks**, and obtain separate approval before any Production merge or actual VIP Telegram release.

No GitHub push or Vercel deployment is intended for this security-migration branch until the integration and release gating have been independently reviewed.
