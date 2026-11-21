# CryptoMainly MI — Make.com TEST-only publisher bridge V1.35

Date: 20 Nov 2026. Owner confirmed test Telegram chat `-1004432697280`, future VIP chat `-1001694306052`. The Make scenario is **CryptoMainly - Market Intelligence VIP Announcements**, URL `https://eu2.make.com/1733288/scenarios/10173567/edit`.

## Live Make inspection, after owner login (read-only)
Observed directly in authenticated Make browser:
- Scenario ID `10173567`; **Inactive** (do not activate until delivery path is fully tested).
- 13: Webhooks > Custom webhook. Earlier successful security tests include API key authentication.
- 14: Tools > Set variable, `setup_status = DRAFT_ONLY`. Upstream filter labelled `EXPLICIT AP...`.
- 15: Data store > Check existence of record; store `CryptoMainly-Market-Intelligence-Sent`; key `{{13.edition_id}}|{{13.destination}}`.
- 16: Tools > Set variable, `dedup_check_status = CHECK_ONLY_DRAFT`. Filter labelled `NOT PREVIO...`.
- 17: Telegram Bot > Send a Photo, connection `CryptoMainly Market Intelligence Bot`, exact chat `-1004432697280`. Existing caption and image URL are **fixed historical 15 Nov test values** and not yet mapped from webhook.
- 18: Data store > Add/replace a record, after Telegram.
- Historical Make scenario executions on 16 Nov include successful manual and replay tests. No new Make deliveries or module edits were performed in this release.

## V1.35 website changes (isolated feature branch only)
The website's V1.34 direct-Telegram transport is REPLACED with an exclusively Make-based TEST-only transport, keeping the same owner-signed-in, CSRF-protected, one-confirmation editorial form and durable private Git send reservations.
- The TEST_ONLY destination is server-pinned; **the real VIP chat ID is never sent** to Make or accepted from the browser. Website button copy is `Send to TEST Group`.
- Disabled unless all **sensitive Production** settings are provided: `MI_MAKE_TEST_ENABLED=true`, `MI_MAKE_DESTINATION=TEST_ONLY`, `MI_MAKE_WEBHOOK_URL` pointing exactly to a validated `https://hook.eu2.make.com/<opaque-id>`, and `MI_MAKE_WEBHOOK_API_KEY`. No such credentials are added by this code release.
- POST `Content-Type: application/json`, `x-make-apikey` protected header (documented by Make), and this payload:
```json
{"schema":"cryptomainly-vip-delivery-v1","edition_id":"HIGHLIGHT_<uuid>","delivery_id":"<uuid>","content_type":"vip_highlight","destination":"TEST_ONLY","approved":true,"summary":"<owner-edited-text-with-original-source-link>","edition_url":"<original-canonical-url>","image_url":"<authorised-first-party-image-or-empty>","published_date":"YYYY-MM-DD","chart_count":1}
```
- `edition_id|destination` remains compatible with the existing Make Data Store dedup key. No client-supplied chat ID; no second Telegram bot or direct Telegram integration.
- **A Make HTTP 200/Accepted is not proof of Telegram delivery.** The website treats default 200 as unverified/unknown, never `Sent`. Positively acknowledged `Sent` requires a final Make Webhook Response containing: `schema=cryptomainly-make-delivery-receipt-v1`, `status=sent`, exact `delivery_id`, `destination=TEST_ONLY`, `chat_id=-1004432697280`, and positive numeric `message_id` from Telegram module 17. Only then does website mark `sent`. If unknown, no auto retry and owner reconciles Make history.
- Supports editable first-party image (strict own HTTPS asset) or empty image to be sent as a Telegram text link-preview through a future Make router. No copyrighted third-party image fetch or upload.
- Website's private queue, source registry and public editions remain unchanged.

## Remaining Make changes before enabling any actual sends
1. Export and secure existing scenario blueprint/restore point; preserve current TEST chat ID.
2. Make scenario must map `summary` to Telegram message/caption dynamically and `image_url` to photo URL dynamically, not the old historical fixed strings.
3. Add a text-post branch (Telegram Send a Message) when `image_url` is empty; preserve existing photo branch for valid owned image. Both branches enforce `destination=TEST_ONLY`, `approved=true` from the server and previously-unannounced key, then update the shared Data Store after a successful Telegram send.
4. Add final Webhook Response with verified Telegram message ID and exact destination and delivery ID. Confirm default 200 vs actual receipt behavior in a private run.
5. Store Make webhook URL/API key in Vercel sensitive Production env without displaying them in chat, logs or Git; then test synthetic one-shot to TEST group only (explicit owner review), invalid auth, duplicate replay, HTTP uncertainty and final persisted receipt.
6. Only then enable `MI_MAKE_TEST_ENABLED=true` and release the exact tested build; do **not** configure actual VIP destination in this release. Final VIP change needs a separate owner's cutover.

## QA / acceptance
- Next.js production build: PASS.
- Updated Make transport unit/security: 40 PASS (mocked network, no real Make calls).
- Authenticated website with six copied real queue items, draft edit + origin / CSRF / disabled send: 28 PASS.
- Prior queue unit and E2E: 32+41, scanner importer 23+24, shared password 11, origin 13, old editorial E2E 95, hosted adapter 25, registry bridge 16. **348 tests passed.**
- No Production promotion, Make scenario activation, VIP message, membership record changes or new third-party charges in this stage.

## Safety and recovery
Git feature branch: `feature/mi-make-test-bridge-2026-11-20`, based on live V1.34 commit `9acbead29baaf32b628b578f1ab72799da1ab3c7`.
Previous production Vercel deployment: `dpl_Da5JNRVvCbmPoSeXDUmUvCKhtWgs`.
Before any Make edits, export a blueprint. Before Vercel promotion, build production-target staging with auto-domain assignment disabled; confirm source registry digest, six queue items, disabled send and exact Git commit. Never mistake Make's default response for Telegram success.

Primary Make references:
- https://apps.make.com/gateway (webhook API key header)
- https://help.make.com/webhooks (default accepted vs Webhook Response)
