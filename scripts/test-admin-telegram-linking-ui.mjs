import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../app/admin/vip/[memberId]/", import.meta.url);
const page = readFileSync(new URL("page.tsx", root), "utf8");
const panel = readFileSync(new URL("TelegramLinkingPanel.tsx", root), "utf8");

assert.match(page, /getPendingTelegramLink/);
assert.match(page, /telegramLinkUiState/);
assert.match(page, /<TelegramLinkingPanel/);
assert.ok(page.indexOf("<TelegramLinkingPanel") < page.indexOf("<TelegramUsernameEditor"));

for (const label of ["Not linked", "Link pending", "Verified", "Unavailable"]) {
  assert.match(panel, new RegExp(label));
}
assert.match(panel, /Generate Telegram Link/);
assert.match(panel, /Generate replacement/);
assert.match(panel, /Copy Link/);
assert.match(panel, /Open Bot/);
assert.match(panel, /Telegram user ID · read only/);
assert.match(panel, /VIP group access: Not managed by Phase 3A/);
assert.match(panel, /sensitive bearer link/i);
assert.match(panel, /will not be recoverable after refresh/i);
assert.doesNotMatch(panel, /tokenHash|rawToken/);

console.log("PASS Telegram identity linking UI wiring is present");
