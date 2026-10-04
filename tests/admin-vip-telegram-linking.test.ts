import test from "node:test";
import assert from "node:assert/strict";

let linking: typeof import("../app/admin/vip/_lib/telegram-linking.ts") | null = null;
try {
  linking = await import("../app/admin/vip/_lib/telegram-linking.ts");
} catch {
  linking = null;
}

function domain() {
  assert.ok(linking, "Telegram linking domain module must exist");
  return linking;
}

test("Telegram link credential is a 32-byte base64url bearer token with SHA-256 digest", () => {
  const api = domain();
  const credential = api.createTelegramLinkCredential("CryptoMainlyMembershipBot");
  assert.match(credential.rawToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(credential.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(credential.tokenHash, api.hashTelegramLinkToken(credential.rawToken));
  assert.equal(credential.deepLink, `https://t.me/CryptoMainlyMembershipBot?start=${credential.rawToken}`);
});

test("Telegram link lifetime is exactly 24 hours", () => {
  assert.equal(domain().TELEGRAM_LINK_TTL_HOURS, 24);
});

test("Telegram numeric identity accepts only positive safe integers", () => {
  const api = domain();
  assert.equal(api.validateTelegramUserId(1), 1);
  assert.equal(api.validateTelegramUserId(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "123"] as unknown[]) {
    assert.throws(() => api.validateTelegramUserId(value));
  }
});
test("Telegram linking RPC detail mapping exposes only approved issuance codes", () => {
  const api = domain();
  const codes = [
    "TELEGRAM_LINK_STALE_STATE",
    "TELEGRAM_LINK_MEMBER_INELIGIBLE",
    "TELEGRAM_LINK_MEMBER_BLOCKED",
    "TELEGRAM_LINK_ALREADY_VERIFIED",
    "TELEGRAM_LINK_STATE_MISSING",
  ] as const;
  assert.deepEqual(api.TELEGRAM_LINK_RPC_ERROR_CODES, codes);
  for (const code of codes) {
    assert.equal(api.telegramLinkRpcErrorCodeFromDetail(`rpc failed: ${code}`), code);
    const failure = api.telegramLinkActionFailureForCode(code);
    assert.equal(failure.ok, false);
    assert.equal(failure.code, code);
    assert.ok(failure.message.length > 0);
    assert.doesNotMatch(failure.message, /postgres|supabase|sql|security definer/i);
  }
  assert.equal(api.telegramLinkRpcErrorCodeFromDetail("raw database failure"), null);
  const unknown = api.telegramLinkActionFailureForCode(null);
  assert.equal(unknown.code, "SERVER_ERROR");
  assert.doesNotMatch(unknown.message, /postgres|supabase|sql/i);
});

test("Telegram linking UI state prioritizes verified, then eligibility, then live pending token", () => {
  const api = domain();
  assert.equal(api.telegramLinkUiState({ membershipStatus: "ACTIVE", isBlocked: false, telegramUserId: 123, pendingExpiresAt: null, now: "2026-10-04T10:00:00Z" }), "verified");
  assert.equal(api.telegramLinkUiState({ membershipStatus: "ACTIVE", isBlocked: true, telegramUserId: null, pendingExpiresAt: null, now: "2026-10-04T10:00:00Z" }), "unavailable");
  assert.equal(api.telegramLinkUiState({ membershipStatus: "FORMER", isBlocked: false, telegramUserId: null, pendingExpiresAt: null, now: "2026-10-04T10:00:00Z" }), "unavailable");
  assert.equal(api.telegramLinkUiState({ membershipStatus: "ACTIVE", isBlocked: false, telegramUserId: null, pendingExpiresAt: "2026-10-05T09:59:59Z", now: "2026-10-04T10:00:00Z" }), "pending");
  assert.equal(api.telegramLinkUiState({ membershipStatus: "LIFETIME", isBlocked: false, telegramUserId: null, pendingExpiresAt: null, now: "2026-10-04T10:00:00Z" }), "not_linked");
  assert.equal(api.telegramLinkUiState({ membershipStatus: "ACTIVE", isBlocked: false, telegramUserId: null, pendingExpiresAt: "2026-10-04T09:59:59Z", now: "2026-10-04T10:00:00Z" }), "not_linked");
});

test("credential helper rejects unsafe bot usernames without echoing bearer material", () => {
  const api = domain();
  assert.throws(() => api.createTelegramLinkCredential("https://t.me/not-a-name"), /bot username/i);
  assert.throws(() => api.hashTelegramLinkToken("not a telegram start token"), /token/i);
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

function dataSource() {
  return readFileSync(join(process.cwd(), "app", "admin", "vip", "_lib", "data.ts"), "utf8");
}

test("Telegram server boundary exposes metadata-only pending-link and consume result types", () => {
  const source = dataSource();
  assert.match(source, /export type TelegramPendingLink = \{[\s\S]*token_id: string;[\s\S]*member_id: string;[\s\S]*issued_at: string;[\s\S]*expires_at: string;[\s\S]*\};/);
  assert.match(source, /export type TelegramConsumeResult = \{[\s\S]*result_code: string;[\s\S]*member_id: string \| null;[\s\S]*telegram_account_id: string \| null;[\s\S]*linked_at: string \| null;[\s\S]*replayed: boolean;[\s\S]*\};/);
  assert.doesNotMatch(source, /export type TelegramPendingLink = \{[^}]*token_hash/s);
});

test("Telegram pending-link helper uses metadata RPC and never reads token hashes directly", () => {
  const source = dataSource();
  assert.match(source, /export async function getPendingTelegramLink\(memberId: string\)/);
  assert.match(source, /rpc\/admin_get_telegram_link_status/);
  const start = source.indexOf("export async function getPendingTelegramLink");
  const end = source.indexOf("export async function issueTelegramLinkToken", start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(source.slice(start, end), /token_hash|telegram_link_tokens\?/);
});

test("Telegram issuance wrapper sends only member, expected safeguarding version, hash and actor", () => {
  const source = dataSource();
  const start = source.indexOf("export async function issueTelegramLinkToken");
  const end = source.indexOf("export async function consumeTelegramIdentityLink", start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.match(body, /rpc\/admin_issue_telegram_link_token/);
  for (const key of ["p_member_id", "p_expected_safeguarding_version", "p_token_hash", "p_actor_id"]) assert.match(body, new RegExp(key));
  assert.doesNotMatch(body, /rawToken|deepLink/);
});

test("Telegram consume wrapper preserves authoritative business result codes", () => {
  const source = dataSource();
  const start = source.indexOf("export async function consumeTelegramIdentityLink");
  assert.ok(start >= 0);
  const body = source.slice(start);
  assert.match(body, /rpc\/telegram_consume_identity_link/);
  for (const key of ["p_token_hash", "p_update_id", "p_telegram_user_id", "p_telegram_username"]) assert.match(body, new RegExp(key));
  assert.match(body, /TelegramConsumeResult\[\]/);
});
