import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261003064000_blocked_member_safeguarding.sql", import.meta.url),
  "utf8"
);

function sqlFunction(name: string) {
  const marker = `create or replace function public.${name}(`;
  const start = migration.indexOf(marker);
  assert.notEqual(start, -1, `${name} definition missing`);
  const end = migration.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${name} terminator missing`);
  return migration.slice(start, end + 4);
}

test("identity corrections lock safeguarding state before identity rows", () => {
  const details = sqlFunction("admin_update_member_details");
  assert.match(
    details,
    /select ss\.ever_blocked into v_ever_blocked\s+from public\.member_safeguarding_state ss\s+where ss\.member_id=p_member_id\s+for update;/
  );
  assert.ok(
    details.indexOf("from public.member_safeguarding_state ss") <
      details.indexOf("from public.members m where m.id=p_member_id for update")
  );
  const telegram = sqlFunction("admin_update_telegram_username");
  assert.match(
    telegram,
    /select ss\.ever_blocked into v_ever_blocked\s+from public\.member_safeguarding_state ss\s+where ss\.member_id=p_member_id\s+for update;/
  );
  assert.ok(
    telegram.indexOf("from public.member_safeguarding_state ss") <
      telegram.indexOf("from public.telegram_accounts ta")
  );
});

test("relationship membership RPCs serialize on safeguarding state before policy checks", () => {
  for (const name of [
    "admin_change_membership_expiry",
    "admin_add_membership_time",
    "admin_renew_active_membership",
    "admin_reactivate_membership",
  ]) {
    const body = sqlFunction(name);
    const statePos = body.indexOf("from public.member_safeguarding_state ss");
    const lockPos = body.indexOf("for update;", statePos);
    const policyPos = body.indexOf("admin_member_relationship_policy");
    assert.ok(statePos >= 0, `${name} does not read safeguarding state`);
    assert.ok(lockPos > statePos, `${name} does not lock safeguarding state`);
    assert.ok(lockPos < policyPos, `${name} checks policy before locking safeguarding state`);
  }
});

test("normal Reactivation clears an expired stored restoration requirement without a Restore event", () => {
  const body = sqlFunction("admin_reactivate_membership");
  assert.match(body, /v_safeguarding_state public\.member_safeguarding_state%rowtype/);
  assert.match(body, /if v_safeguarding_state\.access_restoration_required then/);
  assert.match(body, /set access_restoration_required=false,\s*version=version\+1/);
  assert.match(body, /ACCESS_RESTORATION_EXPIRED_CLEARED/);
  assert.doesNotMatch(body, /MEMBER_ACCESS_RESTORED/);
});

test("safeguarding SECURITY DEFINER functions keep a hardened search_path", () => {
  for (const name of [
    "cm_ensure_member_safeguarding_state",
    "cm_protect_member_identifier",
    "admin_block_member",
    "admin_unblock_member",
    "admin_restore_member_access",
    "admin_complete_safeguarding_task",
  ]) {
    const body = sqlFunction(name);
    assert.match(body, /security definer\s+set search_path = ''/i, `${name} search_path is not hardened`);
  }
});


test("former-to-active Change Expiry also requires a separate Restore Access decision", () => {
  const body = sqlFunction("admin_change_membership_expiry");
  assert.match(body, /v_safeguarding_state public\.member_safeguarding_state%rowtype/);
  assert.match(body, /v_status_before text/);
  assert.match(body, /v_status_after text/);
  assert.match(
    body,
    /v_safeguarding_state\.ever_blocked[\s\S]*not v_safeguarding_state\.is_blocked[\s\S]*v_status_before='FORMER'[\s\S]*v_status_after in \('ACTIVE','LIFETIME'\)/
  );
  assert.match(body, /ACCESS_RESTORATION_REQUIRED/);
});
