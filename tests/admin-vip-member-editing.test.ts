import test from "node:test";
import assert from "node:assert/strict";
import {
  assertHasChanges,
  buildChangeSet,
  editingActionFailureForCode,
  editingRpcErrorCodeFromDetail,
  isoToLondonLocalDateTime,
  londonLocalDateTimeToIso,
  requiresStructuralReason,
  validateMemberDetailsDraft,
  validateMembershipPeriodDraft,
  validatePaymentDraft,
  validateTelegramUsernameDraft,
} from "../app/admin/vip/_lib/member-editing.ts";

test("buildChangeSet returns changed fields only and no-op saves are rejected", () => {
  const before = { display_name: "Alice", email: null, marketing_status: "unknown" };
  const after = { display_name: "Alice B", email: null, marketing_status: "unknown" };
  assert.deepEqual(buildChangeSet(before, after), [
    { field: "display_name", before: "Alice", after: "Alice B" },
  ]);
  assert.deepEqual(buildChangeSet(before, before), []);
  assert.throws(() => assertHasChanges([]), /No changes/i);
});

test("member details normalize contact data and preserve unknown dates as null", () => {
  const result = validateMemberDetailsDraft({
    displayName: "  Alice   Example ",
    email: " ALICE@EXAMPLE.COM ",
    firstJoinedOn: "",
    adminNotes: "  note  ",
    marketingStatus: "allowed",
  });
  assert.deepEqual(result, {
    displayName: "Alice Example",
    email: "alice@example.com",
    firstJoinedOn: null,
    adminNotes: "note",
    marketingStatus: "allowed",
  });
});

test("member detail field bounds are enforced exactly", () => {
  const base = {
    email: "a@example.com",
    firstJoinedOn: null,
    adminNotes: "",
    marketingStatus: "unknown",
  } as const;
  assert.equal(validateMemberDetailsDraft({ ...base, displayName: "x".repeat(200) }).displayName.length, 200);
  assert.throws(
    () => validateMemberDetailsDraft({ ...base, displayName: "x".repeat(201) }),
    /200/
  );
  assert.equal(
    validateMemberDetailsDraft({ ...base, displayName: "A", adminNotes: "x".repeat(4000) }).adminNotes?.length,
    4000
  );
  assert.throws(
    () => validateMemberDetailsDraft({ ...base, displayName: "A", adminNotes: "x".repeat(4001) }),
    /4000/
  );
});

test("Telegram editing normalizes username but rejects protected identity fields", () => {
  assert.deepEqual(validateTelegramUsernameDraft({ telegramUsername: " @Alice_123 " }), {
    telegramUsername: "alice_123",
  });
  assert.deepEqual(validateTelegramUsernameDraft({ telegramUsername: "" }), { telegramUsername: null });
  assert.throws(
    () => validateTelegramUsernameDraft({ telegramUsername: "alice_123", telegramUserId: 123 } as never),
    /protected|unsupported/i
  );
});

test("membership period draft preserves unknown dates and validates protected access", () => {
  const result = validateMembershipPeriodDraft({
    entitlementType: "complimentary",
    planName: " Legacy ",
    startsOn: "",
    expiresOn: "",
    expiryMode: "manual_no_expiry",
    removalProtected: true,
    protectionReason: " Complimentary access ",
    endedEarlyOn: "",
    adminNote: " reviewed ",
  });
  assert.equal(result.startsOn, null);
  assert.equal(result.expiresOn, null);
  assert.equal(result.endedEarlyOn, null);
  assert.equal(result.protectionReason, "Complimentary access");
  assert.throws(
    () => validateMembershipPeriodDraft({ ...result, protectionReason: "" }),
    /protection reason/i
  );
});

test("membership period and payment field limits are enforced", () => {
  const period = {
    entitlementType: "paid",
    planName: "x".repeat(200),
    startsOn: "2026-01-01",
    expiresOn: "2026-02-01",
    expiryMode: "fixed",
    removalProtected: false,
    protectionReason: "",
    endedEarlyOn: "",
    adminNote: "x".repeat(4000),
  };
  assert.equal(validateMembershipPeriodDraft(period).planName?.length, 200);
  assert.throws(
    () => validateMembershipPeriodDraft({ ...period, planName: "x".repeat(201) }),
    /200/
  );
  assert.throws(
    () => validateMembershipPeriodDraft({ ...period, adminNote: "x".repeat(4001) }),
    /4000/
  );

  const payment = validatePaymentDraft({
    amount: "100.5",
    currency: " usdt ",
    network: " ERC20 ",
    txHash: "abc",
    status: "verified",
    receivedAt: "",
    notes: " memo ",
  });
  assert.equal(payment.amount, 100.5);
  assert.equal(payment.currency, "USDT");
  assert.equal(payment.receivedAt, null);
  assert.equal(payment.network, "ERC20");
});

test("legacy payment draft may preserve unknown amount/currency and enforces text bounds", () => {
  assert.deepEqual(
    validatePaymentDraft({
      amount: "",
      currency: "",
      network: "",
      txHash: "",
      status: "pending",
      receivedAt: "",
      notes: "",
    }),
    {
      amount: null,
      currency: null,
      network: null,
      txHash: null,
      status: "pending",
      receivedAt: null,
      notes: null,
    }
  );
  assert.throws(
    () => validatePaymentDraft({ amount: "1", currency: "USDT", network: "x".repeat(101), txHash: "", status: "verified", receivedAt: "", notes: "" }),
    /100/
  );
  assert.throws(
    () => validatePaymentDraft({ amount: "1", currency: "USDT", network: "", txHash: "x".repeat(301), status: "verified", receivedAt: "", notes: "" }),
    /300/
  );
});

test("structural reason detection covers history-sensitive fields only", () => {
  assert.equal(requiresStructuralReason(["display_name", "email"]), false);
  assert.equal(requiresStructuralReason(["first_joined_on"]), true);
  assert.equal(requiresStructuralReason(["starts_on"]), true);
  assert.equal(requiresStructuralReason(["amount"]), true);
  assert.equal(requiresStructuralReason(["telegram_username"]), false);
});

test("London local payment time converts correctly in winter and summer", () => {
  assert.equal(londonLocalDateTimeToIso("2026-01-15T12:30"), "2026-01-15T12:30:00.000Z");
  assert.equal(londonLocalDateTimeToIso("2026-07-15T12:30"), "2026-07-15T11:30:00.000Z");
  assert.equal(isoToLondonLocalDateTime("2026-01-15T12:30:00.000Z"), "2026-01-15T12:30");
  assert.equal(isoToLondonLocalDateTime("2026-07-15T11:30:00.000Z"), "2026-07-15T12:30");
  assert.equal(londonLocalDateTimeToIso(""), null);
  assert.equal(isoToLondonLocalDateTime(null), "");
});

test("London local payment time rejects DST gaps and ambiguous wall times", () => {
  assert.throws(() => londonLocalDateTimeToIso("2026-03-29T01:30"), /invalid|non-unique|ambiguous/i);
  assert.throws(() => londonLocalDateTimeToIso("2026-10-25T01:30"), /invalid|non-unique|ambiguous/i);
});

test("email and Telegram exact length boundaries are enforced", () => {
  const details = {
    displayName: "A",
    firstJoinedOn: null,
    adminNotes: null,
    marketingStatus: "unknown",
  };
  const email254 = `${"a".repeat(242)}@example.com`;
  assert.equal(email254.length, 254);
  assert.equal(validateMemberDetailsDraft({ ...details, email: email254 }).email?.length, 254);
  assert.throws(
    () => validateMemberDetailsDraft({ ...details, email: `${"a".repeat(243)}@example.com` }),
    /email/i
  );
  assert.equal(validateTelegramUsernameDraft({ telegramUsername: "abcde" }).telegramUsername, "abcde");
  assert.equal(validateTelegramUsernameDraft({ telegramUsername: "a".repeat(32) }).telegramUsername?.length, 32);
  assert.throws(() => validateTelegramUsernameDraft({ telegramUsername: "abcd" }), /Telegram/i);
  assert.throws(() => validateTelegramUsernameDraft({ telegramUsername: "a".repeat(33) }), /Telegram/i);
});

test("membership protection and payment text boundaries are exact", () => {
  const basePeriod = {
    entitlementType: "complimentary",
    planName: "Plan",
    startsOn: "",
    expiresOn: "",
    expiryMode: "manual_no_expiry",
    removalProtected: true,
    endedEarlyOn: "",
    adminNote: "",
  };
  assert.equal(
    validateMembershipPeriodDraft({ ...basePeriod, protectionReason: "x".repeat(500) }).protectionReason?.length,
    500
  );
  assert.throws(
    () => validateMembershipPeriodDraft({ ...basePeriod, protectionReason: "x".repeat(501) }),
    /500/
  );

  const payment = { amount: "1", status: "verified", receivedAt: "" };
  assert.equal(validatePaymentDraft({ ...payment, currency: "A".repeat(12), network: "x".repeat(100), txHash: "x".repeat(300), notes: "x".repeat(2000) }).notes?.length, 2000);
  assert.throws(() => validatePaymentDraft({ ...payment, currency: "A".repeat(13), network: "", txHash: "", notes: "" }), /Currency/i);
  assert.throws(() => validatePaymentDraft({ ...payment, currency: "USDT", network: "", txHash: "", notes: "x".repeat(2001) }), /2000/);
});

test("membership and payment helpers reject protected provenance fields", () => {
  const period = {
    entitlementType: "paid", planName: "", startsOn: "2026-01-01", expiresOn: "2026-02-01",
    expiryMode: "fixed", removalProtected: false, protectionReason: "", endedEarlyOn: "", adminNote: "",
  };
  assert.throws(
    () => validateMembershipPeriodDraft({ ...period, source: "manual" } as never),
    /protected|unsupported/i
  );
  const payment = {
    amount: "1", currency: "USDT", network: "", txHash: "", status: "verified", receivedAt: "", notes: "",
  };
  assert.throws(
    () => validatePaymentDraft({ ...payment, verifiedBy: "admin" } as never),
    /protected|unsupported/i
  );
});

test("editing RPC details map only known safe conflict codes", () => {
  const codes = [
    "STALE_PREVIEW",
    "DUPLICATE_EMAIL",
    "DUPLICATE_TELEGRAM",
    "DUPLICATE_TX_HASH",
    "OVERLAPPING_ENTITLEMENT",
    "DUPLICATE_REVIEW_CASE",
    "REVIEW_CASE_NOT_OPEN",
    "INVALID_INPUT",
  ] as const;
  for (const code of codes) {
    assert.equal(editingRpcErrorCodeFromDetail(`database detail: ${code}`), code);
  }
  assert.equal(editingRpcErrorCodeFromDetail("internal database detail that must stay private"), null);
});

test("editing action failures expose safe messages and fail closed for unknown errors", () => {
  assert.deepEqual(editingActionFailureForCode("STALE_PREVIEW"), {
    ok: false,
    code: "STALE_PREVIEW",
    message: "This record changed after you reviewed it. Refresh the member and review the current values again.",
  });
  assert.deepEqual(editingActionFailureForCode(null), {
    ok: false,
    code: "SERVER_ERROR",
    message: "The change could not be saved. Nothing has been changed.",
  });
  assert.equal(editingActionFailureForCode("DUPLICATE_EMAIL").message.includes("existing member"), true);
  assert.equal(editingActionFailureForCode("OVERLAPPING_ENTITLEMENT").message.includes("overlap"), true);
});
