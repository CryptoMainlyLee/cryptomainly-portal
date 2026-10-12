import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "app", "api", "telegram", "e2e-configure", "route.ts"),
  "utf8"
);

test("temporary Telegram E2E operator is preview-only and secret-protected", () => {
  assert.match(source, /process\.env\.VERCEL_ENV\s*!==\s*["']preview["']/);
  assert.match(source, /E2E_TELEGRAM_OPERATOR_SECRET/);
  assert.match(source, /VERCEL_GIT_COMMIT_REF/);
  assert.match(source, /searchParams\.get\(["']key["']\)/);
  assert.match(source, /TELEGRAM_MEMBERSHIP_BOT_TOKEN/);
  assert.match(source, /TELEGRAM_MEMBERSHIP_WEBHOOK_SECRET/);
  assert.match(source, /VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.match(source, /x-vercel-protection-bypass/);
  assert.match(source, /drop_pending_updates/);
  assert.match(source, /deleteWebhook/);
  assert.match(source, /deleted:\s*true/);
  assert.match(source, /buildTelegramWebhookRegistration/);
  assert.match(source, /actualUpdates\[0\]\s*!==\s*["']message["']/);
  assert.doesNotMatch(source, /telegram_group_access/);
  assert.doesNotMatch(source, /console\.(log|error|warn)/);
});

test("temporary operator returns only redacted webhook verification metadata", () => {
  assert.match(source, /verified:/);
  assert.match(source, /allowedUpdates:/);
  assert.doesNotMatch(source, /webhookUrl:/);
  assert.doesNotMatch(source, /botToken\s*[,}]/);
  assert.doesNotMatch(source, /webhookSecret\s*[,}]/);
});
