import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("Phase 3A consume V2 wrapper is hardened and old direct RPC is revoked", () => {
  const sql = readFileSync(
    join(root, "supabase", "migrations", "20261012095934_phase3a_telegram_consume_v2_wrapper.sql"),
    "utf8"
  ).replace(/\s+/g, " ").toLowerCase();

  assert.match(sql, /create or replace function public\.telegram_consume_identity_link_v2\(/);
  assert.match(sql, /security definer set search_path = ''/);
  assert.match(sql, /grant execute on function public\.telegram_consume_identity_link_v2[^;]+to service_role/);
  assert.match(sql, /revoke execute on function public\.telegram_consume_identity_link\([^;]+from service_role/);
  assert.match(sql, /insert into public\.telegram_accounts as ta\(member_id, dm_available\)/);
  assert.match(sql, /v_result\.result_code not in \('linked','already_linked_idempotent'\)/);
  assert.match(sql, /delete from public\.telegram_accounts ta/);
  assert.doesNotMatch(sql, /telegram_group_access/);
});

test("application consumes Telegram links only through the V2 wrapper RPC", () => {
  const source = readFileSync(
    join(root, "app", "admin", "vip", "_lib", "data.ts"),
    "utf8"
  );
  assert.match(source, /rpc\/telegram_consume_identity_link_v2/);
  assert.doesNotMatch(source, /["']rpc\/telegram_consume_identity_link["']/);
});
