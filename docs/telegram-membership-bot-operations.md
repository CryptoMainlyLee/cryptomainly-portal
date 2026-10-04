# CryptoMainly Membership Bot — Phase 3A Operations

## Scope

This runbook operates the dedicated CryptoMainly Membership bot for verified Telegram identity linking only.

Phase 3A never invites, removes, bans, unbans, approves joins, creates group invite links, or otherwise changes Telegram group access.

A verified Telegram identity is not a VIP access grant.

## Secrets and configuration

Keep these values out of chat, git, screenshots, documentation, application logs, and shared command history:

- `TELEGRAM_MEMBERSHIP_BOT_TOKEN`
- `TELEGRAM_MEMBERSHIP_WEBHOOK_SECRET`

The non-secret bot username is stored as `TELEGRAM_MEMBERSHIP_BOT_USERNAME` without `@`.

The operator script also reads `TELEGRAM_MEMBERSHIP_WEBHOOK_URL` when configuring a webhook.

Enter app secrets directly into Vercel Environment Variables or a local ignored `.env`/session environment. Never use `NEXT_PUBLIC_` names.

## Create the dedicated bot

1. In Telegram, open the official BotFather account.
2. Use `/newbot` and create a dedicated CryptoMainly Membership bot, separate from G-Bot/trading functionality.
3. Record the assigned bot username and token directly into the intended secret store.
4. Do not add the Membership bot to VIP groups for Phase 3A; it needs only private member conversations.

Generate a separate webhook secret of at least 32 random bytes encoded with Telegram's permitted characters (`A-Z`, `a-z`, `0-9`, `_`, `-`). Telegram accepts 1–256 characters for `secret_token`; use a high-entropy value rather than a memorable phrase.

## Preview configuration

Preview E2E is allowed only after the explicit rollout gate in the Phase 3A plan.

Before pointing Telegram at a Preview deployment:

- Preview must use the temporary Supabase development branch, never Production data.
- Set Preview-only bot username/token/webhook secret in Vercel.
- Set `TELEGRAM_MEMBERSHIP_WEBHOOK_URL` locally to the exact Preview HTTPS route ending `/api/telegram/webhook`.
- Confirm the Preview deployment is READY and admin auth works.

Then run:

```text
node scripts/configure-telegram-membership-webhook.mjs
```

The script calls `setWebhook` with exactly `allowed_updates=["message"]` and the configured `secret_token`, then calls `getWebhookInfo` and fails unless the returned URL and update type exactly match.

Its console output contains only the webhook URL, allowed update type, boolean configuration flags, and verification state. It must never print either secret.

## Remove a Preview webhook

After Preview E2E, remove the disposable target before deleting the temporary Supabase branch:

```text
node scripts/configure-telegram-membership-webhook.mjs --delete
```

The script calls `deleteWebhook` with `drop_pending_updates=false`, then verifies through `getWebhookInfo` that Telegram reports an empty webhook URL.

Deleting the webhook changes delivery routing only. It does not delete verified identity records or change membership/group access.

## Production cutover

Production cutover requires the explicit final approval gate in the Phase 3A plan.

Set Production-only Vercel values for the bot username, bot token, and Production webhook secret. Deploy and verify the approved `main` commit before changing Telegram.

Set the operator URL to:

```text
https://www.cryptomainly.co.uk/api/telegram/webhook
```

Run the configure script and verify its safe output reports the exact Production URL and `message` as the only allowed update type.

After cutover, perform only the non-mutating Production smoke checks from the implementation plan. Do not bulk-generate member links.

## Secret rotation

1. Generate a new high-entropy webhook secret locally.
2. Replace the Vercel environment value without exposing it in chat or logs.
3. Deploy/confirm the application using the new value.
4. Run the configure script using the same new secret so Telegram starts sending the matching header.
5. Verify `getWebhookInfo` through the script.

A short mismatch can cause Telegram requests to receive a non-2xx response and be retried, so perform the application and Telegram sides consecutively.

Rotate the bot token only through BotFather. After rotation, update Vercel/local secret storage and re-run webhook configuration with the new token.

## Emergency rollback

If webhook delivery behaves unexpectedly, remove the webhook with `--delete` first. This stops new webhook delivery without changing canonical member identity data.

Do not "fix" an identity issue by editing numeric Telegram IDs directly, transferring IDs between members, unblocking a safeguarding record, or changing group access.

Use the audited admin/database workflows defined by Phase 3A and the safeguarding system.

## Audit boundary

The bot/webhook may create Telegram link-token audit entries, verified-identity audit entries, and legitimate business-rule rejection entries. It must never imply VIP group access was granted.

All four existing automation switches remain OFF throughout Phase 3A.
