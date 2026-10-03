import test from "node:test";
import assert from "node:assert/strict";

let safeguarding: typeof import("../app/admin/vip/_lib/safeguarding.ts") | null = null;
try {
  safeguarding = await import("../app/admin/vip/_lib/safeguarding.ts");
} catch {
  safeguarding = null;
}

function domain() {
  assert.ok(safeguarding, "safeguarding domain module must exist");
  return safeguarding;
}

test("safeguarding summary is trimmed, required, and capped at 200 characters", () => {
  const api = domain();
  assert.equal(api.validateSafeguardingSummary("  No further contact  "), "No further contact");
  assert.equal(api.validateSafeguardingSummary("x".repeat(200)).length, 200);
  assert.throws(() => api.validateSafeguardingSummary("   "));
  assert.throws(() => api.validateSafeguardingSummary("x".repeat(201)));
});

test("safeguarding reason is trimmed, required, and capped at 1000 characters", () => {
  const api = domain();
  assert.equal(api.validateSafeguardingReason("  Safeguarding decision  "), "Safeguarding decision");
  assert.equal(api.validateSafeguardingReason("x".repeat(1000)).length, 1000);
  assert.throws(() => api.validateSafeguardingReason(""));
  assert.throws(() => api.validateSafeguardingReason("x".repeat(1001)));
});

test("Telegram removal outcomes are exact and unknown outcomes are rejected", () => {
  const api = domain();
  assert.equal(
    api.validateTelegramRemovalOutcome("REMOVED_FROM_TELEGRAM"),
    "REMOVED_FROM_TELEGRAM"
  );
  assert.equal(
    api.validateTelegramRemovalOutcome("CONFIRMED_NOT_PRESENT_OR_NO_ACCESS"),
    "CONFIRMED_NOT_PRESENT_OR_NO_ACCESS"
  );
  assert.throws(() => api.validateTelegramRemovalOutcome("removed"));
});

test("protected identifier types include future numeric Telegram identity", () => {
  const api = domain();
  assert.deepEqual(api.SAFEGUARDING_IDENTIFIER_TYPES, [
    "email",
    "telegram_username",
    "telegram_user_id",
  ]);
});

test("safeguarding RPC details map only exact safe codes", () => {
  const api = domain();
  for (const code of api.SAFEGUARDING_RPC_ERROR_CODES) {
    assert.equal(api.safeguardingRpcErrorCodeFromDetail(`error ${code}`), code);
  }
  assert.equal(api.safeguardingRpcErrorCodeFromDetail("raw postgres detail"), null);
});

test("safeguarding action failures expose only safe admin messages", () => {
  const api = domain();
  for (const code of api.SAFEGUARDING_RPC_ERROR_CODES) {
    const failure = api.safeguardingActionFailureForCode(code);
    assert.equal(failure.ok, false);
    assert.equal(failure.code, code);
    assert.ok(failure.message.length > 0);
    assert.doesNotMatch(failure.message, /postgres|supabase|sql|security definer/i);
  }
  const unknown = api.safeguardingActionFailureForCode(null);
  assert.equal(unknown.code, "SERVER_ERROR");
  assert.doesNotMatch(unknown.message, /postgres|supabase|sql/i);
});

test("current Blocked and protected-history duplicate kinds stay distinct", () => {
  const api = domain();
  assert.equal(api.safeguardingDuplicateKind("current", "blocked"), "BLOCKED_MEMBER_MATCH");
  assert.equal(
    api.safeguardingDuplicateKind("protected_history", "previously_blocked"),
    "PROTECTED_MEMBER_MATCH"
  );
  assert.equal(api.safeguardingDuplicateKind("current", null), null);
});

test("display-name similarity never becomes a safeguarding identity match", () => {
  const api = domain();
  assert.equal(api.safeguardingDuplicateKind("display_name", "blocked"), null);
});

test("missing or invalid safeguarding policy fails closed", () => {
  const api = domain();
  const valid = {
    member_id: "member-1",
    safeguarding_state_present: true,
    is_blocked: false,
    ever_blocked: false,
  };
  assert.equal(api.requireSafeguardingPolicy("member-1", [valid]), valid);
  assert.throws(
    () => api.requireSafeguardingPolicy("member-2", [valid]),
    /SAFEGUARDING_STATE_MISSING/
  );
  assert.throws(
    () => api.requireSafeguardingPolicy("member-1", [{ ...valid, safeguarding_state_present: false }]),
    /SAFEGUARDING_STATE_MISSING/
  );
});

test("member policy maps to blocked, previously blocked, or ordinary duplicate state", () => {
  const api = domain();
  assert.equal(api.safeguardingStateForPolicy({ is_blocked: true, ever_blocked: true }), "blocked");
  assert.equal(
    api.safeguardingStateForPolicy({ is_blocked: false, ever_blocked: true }),
    "previously_blocked"
  );
  assert.equal(api.safeguardingStateForPolicy({ is_blocked: false, ever_blocked: false }), null);
});
