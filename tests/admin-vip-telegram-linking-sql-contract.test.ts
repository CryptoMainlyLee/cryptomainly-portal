import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase", "migrations");

function migrationSql() {
  const matches = readdirSync(migrationsDir).filter((name) =>
    name.endsWith("_phase3a_telegram_identity_linking.sql")
  );
  assert.equal(matches.length, 1, "exactly one Phase 3A Telegram linking migration must exist");
  return readFileSync(join(migrationsDir, matches[0]), "utf8");
}

function compact(sql: string) {
  return sql.replace(/\s+/g, " ").toLowerCase();
}

test("Phase 3A migration creates a locked-down hash-only token table", () => {
  const sql = compact(migrationSql());
  assert.match(sql, /create table public\.telegram_link_tokens/);
  assert.match(sql, /token_hash text/);
  assert.match(sql, /unique\s*\(token_hash\)/);
  assert.match(sql, /alter table public\.telegram_link_tokens enable row level security/);
  assert.match(sql, /revoke all on table public\.telegram_link_tokens from public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /grant select on table public\.telegram_link_tokens to service_role/);
});

test("Phase 3A migration enforces one live token and one verified account per member", () => {
  const sql = compact(migrationSql());
  assert.match(sql, /create unique index[^;]+telegram_link_tokens[^;]+member_id[^;]+where[^;]+consumed_at is null[^;]+revoked_at is null/);
  assert.match(sql, /create unique index[^;]+telegram_accounts[^;]+member_id[^;]+where[^;]+telegram_user_id is not null/);
});
test("Phase 3A privileged RPCs are service-role only with hardened search paths", () => {
  const sql = compact(migrationSql());
  for (const fn of [
    "admin_get_telegram_link_status",
    "admin_issue_telegram_link_token",
    "telegram_consume_identity_link",
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\(`));
    assert.match(sql, new RegExp(`${fn}[\\s\\S]*security definer[\\s\\S]*set search_path = ''`));
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}[^;]+from public, anon, authenticated`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}[^;]+to service_role`));
  }
});

test("Phase 3A RPCs serialize on safeguarding state before Telegram identity mutation", () => {
  const sql = compact(migrationSql());
  const issue = sql.indexOf("create or replace function public.admin_issue_telegram_link_token");
  const consume = sql.indexOf("create or replace function public.telegram_consume_identity_link");
  assert.ok(issue >= 0 && consume > issue);
  const issueBody = sql.slice(issue, consume);
  const consumeBody = sql.slice(consume);
  assert.ok(issueBody.indexOf("from public.member_safeguarding_state") < issueBody.indexOf("from public.telegram_accounts"));
  assert.match(issueBody, /for update/);
  assert.ok(consumeBody.indexOf("from public.member_safeguarding_state") < consumeBody.indexOf("from public.telegram_accounts"));
  assert.match(consumeBody, /for update/);
});

test("Phase 3A revokes pending tokens when safeguarding transitions to Blocked", () => {
  const sql = compact(migrationSql());
  assert.match(sql, /create or replace function public\.revoke_telegram_link_tokens_on_block\(/);
  assert.match(sql, /old\.is_blocked = false and new\.is_blocked = true/);
  assert.match(sql, /update public\.telegram_link_tokens[^;]+set revoked_at/);
  assert.match(sql, /create trigger[^;]+after update of is_blocked on public\.member_safeguarding_state/);
});
test("Phase 3A migration contains no group-access DML or automation enabling writes", () => {
  const sql = compact(migrationSql());
  assert.doesNotMatch(sql, /(?:insert into|update|delete from) public\.telegram_group_access/);
  assert.doesNotMatch(sql, /(?:automatic_reminders_enabled|automatic_removals_enabled|campaign_sending_enabled|payment_auto_activation_enabled)[^;]*(?:true|enabled)/);
});

test("Phase 3A metadata RPC never returns token hashes", () => {
  const sql = compact(migrationSql());
  const start = sql.indexOf("create or replace function public.admin_get_telegram_link_status");
  const end = sql.indexOf("create or replace function public.admin_issue_telegram_link_token");
  assert.ok(start >= 0 && end > start);
  const body = sql.slice(start, end);
  assert.doesNotMatch(body, /returns table\([^)]*token_hash/);
  assert.match(body, /token_id uuid/);
  assert.match(body, /expires_at timestamptz/);
});
