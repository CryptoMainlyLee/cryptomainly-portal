# CryptoMainly V1.9 — Editorial control and daily research preview
Established 16 November 2026. FEATURE BRANCH ONLY; not a production deployment.

## New research cadence
ChatGPT cloud scanner (existing task ID Automation_28e1bcfb50a48191944a541350bd15f4) is scheduled daily:
Monday 10:00, Tuesday–Sunday 15:30 UK local time. Daily **research** is distinct
from publication: new editions still require ten genuinely valuable verified
technical-chart setups as the target, strict 336-hour freshness, human source /
rights / FCA editorial approval and a separate deployment decision. Smaller
editions require explicit editorial exception, never filler.

Local-only source navigator supports all seven slots via the companion
`scheduled-research-v16/source_plan.py` and updated source policy. Local Windows
scheduled jobs are planning aids only and require the laptop switched on. The
cloud scanner runs independently. No paid X API or TinyFish usage is enabled.

## Website withdrawal design
`app/vip/market-intelligence/visibility.json` has separate lists of
hidden_edition_slugs and hidden_post_ids_by_edition. It is separate from
immutable original observation snapshots so editorial actions are reversible.

The exported RESEARCH_EDITIONS in editions.ts applies takedowns on the server
*before* passing a ResearchEdition prop to the client component. The
MarketIntelligenceDashboard no longer imports the raw editions as a runtime
client value. A hidden post disappears from both the Latest and Archive pages;
an entire hidden/empty edition disappears from archive index and dated route
(and Latest falls back to the next visible edition, or 404 when none remain).
Historical original files can remain in Git for rollback, but do not get
included in the rendered client payload after a fresh build.

**Caution:** Any dated `public/assets/market-intelligence/YYYY-MM-DD-telegram.png`
screenshot may still depict a withdrawn item and remains accessible until
removed or replaced. The local editor therefore quarantines the dated
screenshot from the *feature worktree* whenever a post/edition is withdrawn.
A restored post does NOT automatically restore the screenshot. Review and
regenerate an approved image separately.

This does not guarantee erasure from old Git history, build artifacts, cached
search results, Telegram copies or historical publicly reachable deployments.
A legal, privacy or copyright deletion request may need cache purging, old
deployment/access audit, separate content-history remediation and downstream
platform takedowns. Do not assert that a Vercel deployment alone erases copies.

## Local operator UI
Double-click:
`Documents\CryptoMainly-Trade-Setup-Scanner\OPEN-EDITORIAL-CONTROLS.cmd`

It runs `editorial_control_v19.py` on `http://127.0.0.1:8767/`, bound
strictly to localhost. It opens a browser tab. Close the command window to
stop. It uses CSRF tokens, same-origin requests, a fixed local Host, HTML
escaping, narrow field validators, local audit receipts and pre-edit backups.
The only mutable website target is this feature worktree:
`C:\Users\leeln\CryptoMainly_LocalWork\mi-editorial-controls-v18-2026-11-16`

It lets the editor add, rename, reclassify or remove individual curated X
accounts, and withdraw/restore individual observation cards or entire dated
research editions. It does NOT edit existing X posts, change Telegram,
memberships, Supabase, live admin authentication or production website files.

The scanner's editable source file currently remains:
`Documents\CryptoMainly-Trade-Setup-Scanner\scheduled-research-v16\sources-v16.json`
(the filename is retained for compatibility; content version 1.9).

**Important dual-sync boundary:** The ChatGPT cloud automation has a saved
whitelist in its prompt, and cannot automatically see local laptop edits
while the computer is switched off. After source edits, explicitly ask
ChatGPT to **sync the CryptoMainly source list**. It can then review the
saved local config and update the SAME scheduled cloud task; no new automation
is required. A local change alone does not modify unattended research.

All actions require separate editorial review and deployment before changing
`cryptomainly.co.uk`. The GUI is deliberately not an internet-facing admin
interface. Future live one-click moderation would require independent
authenticated, audited server-side state and security review, not a public
unprotected route.

## Tests
- Offline synthetic `test_editorial_control_v19.py`: source add/edit/remove,
  duplicate/invalid input rejection, post/edition withdrawal and restoration,
  screenshot quarantine, private audit, feature-branch protection.
- Legacy `test_research_v16.py` and `test_release_handoff.py` remain green.
- Next.js 14.2.33 production build/typecheck succeeded in isolated worktree.
- A test hidden post was excluded from the statically generated Latest HTML,
  its dated Archive HTML and searched Next.js client JS bundles; other posts
  remained visible. The test-only visibility change was reset afterward.
- Local HTTP GET returned 200, UI contained source/post controls, and an
  unauthorised POST returned 403.
- Existing production main is unchanged; do not auto-deploy.

## Release gates
1. Review withdrawn item and audit reason, ensure no improper live/snapshot
   media or standalone PNG remains publicly reachable after deploy.
2. Inspect complete Git diff and build logs, restore zip.
3. Confirm no membership, safeguarding, Supabase or Telegram changes.
4. Approve the exact production rollout separately.
5. After rollout, verify site Latest, Archive and omitted routes, CDN media,
   previous link behaviour, and signed-in mobile UI.
6. Sync revised source whitelist into the existing cloud task only after
   the user's source changes are explicitly reviewed and authorised.
