# V1.20 hosted registry preflight — 17 November 2026

V1.19 authenticated read-only Preview (63b6297) remains unchanged. Verified recovery ZIP saved in OneDrive. New tests: `node scripts/test-mi-hosted-adapter-v120.cjs` — 25 passed, mocked GitHub responses only, no real token or external writes.

Existing GitHub roster fetched successfully from Dell: 14 sources, revision 1dca1387599ee69162c56aa1576c5261b5543a5db855bd2e53d9a5a9048dd12d. Scheduled 17 Nov cloud scanner reported registry access disabled, fallback to original 14, 0 qualifying observations, no publish. This remains a release blocker. No change to scanner task or canonical registry.

Validated sandbox seed in CryptoMainly_LocalWork/mi-v120-sandbox-initial-state.json, SHA256 071ae7d270275846896c6d8e31a52d2c689ac3ea83f93fcaec9ec1abdf3c6f81. Contains public roster, explicit empty visibility and audit. No private information. Provision private state-only repository cryptomainly-editorial-sandbox once GitHub session is authenticated. Do not grant access to website repo; use separate fine-grained scope. Dedicated automation browser at GitHub sign-in; credentials not requested or read. GitHub connector is listed as installed but no GitHub repository write operation was exposed in this session.

Release gates: actual sandbox API writes with restricted token, live scanner source retrieval through supported cloud path and exact revisions, permanent user-owned editorial access and mobile review. Do not enable production or retire old registry until all gates pass. No new paid service.
