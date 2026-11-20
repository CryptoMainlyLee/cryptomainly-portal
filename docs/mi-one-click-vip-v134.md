# CryptoMainly — Market Intelligence single-action VIP highlights (V1.34)

Date: 20 November 2026. Scope: user-requested simplified private research editor and **direct individual Telegram VIP highlight** workflow. Not a daily website-edition publisher.

## User request reflected
- Show a helpful **larger research overview with original chart/image previews**, plus editable data and post text.
- Remove the six-checkbox approval workflow and the intermediate `Mark review-approved (NOT publish)` control for **individual Telegram highlights**.
- Have just ONE owner confirmation checkbox plus **Send to VIP**, which saves the edits and then sends one individual highlight if the dedicated VIP bot is configured.
- Keep **Save edits** as a non-sending option. Add-candidate and scanner batch-import tools remain.
- Do not remove or weaken the existing website's account-registry, historical archive, membership, authentication or automated research publishing isolation.

## Implemented
- `/admin/market-intelligence/queue`: enlarged, clear cards with source/author/date and inline official X embedded post previews (including images where X permits). Glassnode/CryptoQuant show their original provider article link; no external chart bytes are copied to CryptoMainly or uploaded to Telegram.
- Each card's edit drawer includes all editorial fields, plus an individually editable VIP message and OPTIONAL CryptoMainly-hosted image URL.
- A single owner confirmation checkbox attests they reviewed the message, original source and any image permissions. The same form has `Save edits` and `Send to VIP`.
- Telegram sends are blocked unless **dedicated** configuration is explicitly installed: Production-only `MI_VIP_SEND_ENABLED=true`, sensitive `MI_VIP_BOT_TOKEN`, and exact real VIP chat ID `MI_VIP_CHAT_ID` (numerical group ID beginning -100). The membership bot must never be reused.
- When enabled, `Send to VIP` writes a **durable send reservation to private GitHub** before issuing a **single** Telegram API POST. On positive acknowledgement, records Telegram message ID and sent status. Any ambiguous/failed result becomes UNKNOWN and cannot be retried automatically; chat must be manually reconciled. Concurrent browser clicks and stale editors reject by source-file SHA.
- Text sending uses `sendMessage` with original-source link preview (Telegram may display the chart thumbnail, not guaranteed). Images can be sent with `sendPhoto` only from a strict HTTPS `www.cryptomainly.co.uk/assets/market-intelligence/...` URL; no unlicensed third-party image fetch/upload is supported.
- Sends remain **independent** of the website's dated edition publication. Direct owner-sends can highlight an existing archived website observation; duplication of a newly-added archived original is still refused.
- The six real original candidate records remain unchanged in private storage. The old evidence schema fields are retained for backwards compatibility with existing scan/review code, but are not shown or used as a gate for owner-directed individual VIP sends.

## Release safety
- The new UI is useful and read-only/editable even when VIP send is OFF. It explicitly says the bot connection is incomplete and disables the outbound button.
- Existing Vercel Production metadata contains the separate Telegram MEMBERSHIP bot only. There is **no dedicated VIP publishing token, exact target ID, or explicit send enable flag** installed as of the change. Do not claim the actual VIP send is live.
- Once owner connects CryptoMainlyIntelligenceBot to real VIP with post permission: configure bot token as Vercel sensitive Production environment variable without copying it to chat; configure destination ID; verify `getMe` and `getChat` without sending; test one expressly authorised non-promotional message in the private TEST chat via dedicated bot first; only then explicitly enable `MI_VIP_SEND_ENABLED=true` for Production and deploy/promote exact reviewed build.
- Avoid Telegram redistribution of unlicensed third-party charts. Official X embeds in admin and original source links retain rights at the publisher. If no owned/licensed image is provided, link-preview is best effort and may be unavailable.

## Test acceptance
- Next.js production build passed.
- Existing review queue backend + route E2E, scanner batch, shared VIP password, origin, editorial, private GitHub storage, and registry bridge tests passed without production mutations.
- Dedicated one-click VIP security mock passed 30+ checks: disabled-by-default, approved destination, source URL preserved, durable reservation, sent receipt, no duplicate/unknown retry, wrong chat ACK rejected, first-party-only image, archived item highlight support.
- Authenticated isolated web server with copied six actual candidate records passed 28 checks: all render, X embed and provider links, single owner confirmation, draft save, no unauthorized sends, CSRF and cross-origin rejection.
- No real Telegram messages sent in tests; no membership records touched and no public edition published.

## Deployment / rollback
- Feature branch `feature/mi-one-click-vip-2026-11-20`, based on Production V1.33 SHA `f23ca6cfb9833df82176ab0ad2ce0dd137cb3cfc`.
- Before Production publish, create and validate Git bundle, stage exact Git SHA as Production target with `autoAssignCustomDomains=false`, check all principal routes and source SHA, then promote and confirm live alias.
- Previous live deployment: `dpl_9StdQGiPGBf7LBsHVstkxAVUwTLG`.
- The live site must continue to function even if Telegram credentials are absent.
