# Market Intelligence consolidation — 19 November 2026

Purpose: finish the existing daily chart service; no expansion of project scope.
Production remains on main 1d9645e; this branch builds on isolated editorial work 7d7dc79. No deployment, live state or Telegram change.

## Verified locally
- Build/type/lint and withdrawal prebuild passed. Existing dependency lock reused; no new dependencies. Existing outdated browser data and metadataBase warnings are not addressed.
- 95 integrated HTTP checks passed with disposable local state: login, CSRF, unauthorised writes, revisions, add/edit/remove, projection, archive search, hide/restore and PNG withdrawal, corruption fail-closed.
- 25 hosted adapter mock checks; 16 existing bridge mock checks.
- Archive desktop 1366x900 and mobile 390x844 browser search/filter tests passed without horizontal overflow.
- Isolated Python staging/handoff regression and integrated temporary edition fixture passed (5-chart exception, third-author approval, quoted historical IDs, exact historical thesis keys, full-content handoff).
- Existing private delivery simulation passes from its original fixture directory; its copied script failed only because its image fixture was absent.
- Current public roster read independently validated at same revision used by current cloud bridge (14 sources).

## One source-of-truth cutover — NOT YET RELEASED
Current scanner/bridge and staging CLI still read the existing public roster branch. The new editor writes to a dedicated private state repository in hosted mode. The new GET /api/market-intelligence/source-registry is an uncached read-only public projection of the exact same writable editor state. It strips visibility, audit and credentials, and refuses missing/invalid storage. Local synthetic add/remove tests confirm matching revisions.

Before production: provision the separately scoped production state repository, copy only verified current roster and empty/approved moderation baseline, configure scoped server-only credentials/owner login, perform final security and hosted QA, and obtain explicit production approval. Do not point the existing scanner or Apps Script at preview/test state. Coordinate the production endpoint, bridge's pinned source URL, scheduled scanner and release CLI together after a successful production read; compare exact digest, then prove a controlled owner-approved roster change propagates end-to-end. Retire the old local editor write path only after migration acceptance. Keep old registry fallback read-only during migration. No duplicate writable authoritative registries.

## Release
Research intake must contain exact fresh registry_revision and keep human approval fields false until review. Stage/release scripts reject differing live registry revisions and preserve source UTC, asset, timeframe, pattern, confirmation, invalidation and thesis metadata for new editions. Exact historical key detection cannot resolve semantic duplicates or legacy records without keys: human archive and pending review remains mandatory. Short launch proposals 5–9 require explicit human exception; third same-author item separately approved. No synthetic item may be published.

Next: authenticated hosted preview using disposable test state, production security/credential readiness, controlled registry migration, genuine fresh edition with separate approval and first integrated live publication. No automatic publishing or Telegram activation.
