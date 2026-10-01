import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNewMemberPreview,
  isSimilarDisplayName,
  normalizeDisplayName,
  normalizeEmail,
  normalizeTelegramUsername,
  validateNewMemberDraft,
  type NewMemberDraft,
} from "../app/admin/vip/_lib/new-member.ts";

function paidDraft(overrides: Partial<NewMemberDraft> = {}): NewMemberDraft {
  return {
    displayName: " New Member ",
    email: " Person@Example.COM ",
    telegramUsername: " @New_Member ",
    entitlementType: "paid",
    startDate: "2027-01-31",
    durationValue: 1,
    durationUnit: "months",
    manualExpiry: "",
    expiryOverrideReason: "",
    reason: "Initial VIP membership",
    amount: "100",
    currency: "usdt",
    paymentDate: "",
    txHash: "",
    paymentNote: "",
    similarNameAcknowledged: false,
    ...overrides,
  };
}

test("normalizes optional email and Telegram identity", () => {
  assert.equal(normalizeEmail(" Person@Example.COM "), "person@example.com");
  assert.equal(normalizeEmail("   "), null);
  assert.equal(normalizeTelegramUsername(" @New_Member "), "new_member");
  assert.equal(normalizeTelegramUsername("   "), null);
});

test("normalizes display-name whitespace without destroying display text", () => {
  assert.equal(normalizeDisplayName("  Lee   O'Connor  "), "Lee O'Connor");
});

test("validates and normalizes a paid member draft", () => {
  const result = validateNewMemberDraft(paidDraft());
  assert.equal(result.displayName, "New Member");
  assert.equal(result.email, "person@example.com");
  assert.equal(result.telegramUsername, "new_member");
  assert.equal(result.entitlementType, "paid");
  assert.equal(result.amount, 100);
  assert.equal(result.currency, "USDT");
  assert.equal(result.paymentDate, null);
  assert.equal(result.txHash, null);
  assert.equal(result.paymentNote, null);
});

test("rejects invalid display name, email, and Telegram username", () => {
  assert.throws(() => validateNewMemberDraft(paidDraft({ displayName: "   " })));
  assert.throws(() => validateNewMemberDraft(paidDraft({ email: "not-an-email" })));
  assert.throws(() => validateNewMemberDraft(paidDraft({ telegramUsername: "@bad-name!" })));
});

test("rejects unsupported entitlement and invalid duration", () => {
  assert.throws(() => validateNewMemberDraft(paidDraft({ entitlementType: "lifetime" })));
  assert.throws(() => validateNewMemberDraft(paidDraft({ durationValue: 0 })));
  assert.throws(() => validateNewMemberDraft(paidDraft({ durationValue: 1.5 })));
  assert.throws(() => validateNewMemberDraft(paidDraft({ durationUnit: "years" })));
});

test("calculates calendar-month expiry from the start date", () => {
  const result = validateNewMemberDraft(paidDraft());
  assert.equal(result.calculatedExpiry, "2027-02-28");
  assert.equal(result.finalExpiry, "2027-02-28");
});

test("rejects final expiry on or before the start date", () => {
  assert.throws(() => validateNewMemberDraft(paidDraft({ manualExpiry: "2027-01-31", expiryOverrideReason: "Correction" })));
  assert.throws(() => validateNewMemberDraft(paidDraft({ manualExpiry: "2027-01-30", expiryOverrideReason: "Correction" })));
});

test("requires an override reason only when final expiry changes", () => {
  assert.throws(() => validateNewMemberDraft(paidDraft({ manualExpiry: "2027-03-15" })));
  assert.doesNotThrow(() => validateNewMemberDraft(paidDraft({ manualExpiry: "2027-02-28" })));
});

test("keeps paid payment date optional without inventing one", () => {
  const result = validateNewMemberDraft(paidDraft({ paymentDate: "   " }));
  assert.equal(result.paymentDate, null);
});

test("rejects payment data for complimentary and trial drafts", () => {
  assert.throws(() => validateNewMemberDraft(paidDraft({ entitlementType: "complimentary" })));
  assert.throws(() => validateNewMemberDraft(paidDraft({ entitlementType: "trial" })));
  assert.doesNotThrow(() =>
    validateNewMemberDraft(
      paidDraft({
        entitlementType: "trial",
        amount: "",
        currency: "",
        paymentDate: "",
        txHash: "",
        paymentNote: "",
      })
    )
  );
});

test("builds review preview with calculated and overridden expiry", () => {
  const preview = buildNewMemberPreview(
    paidDraft({ manualExpiry: "2027-03-15", expiryOverrideReason: "Promotional end date" })
  );
  assert.equal(preview.calculatedExpiry, "2027-02-28");
  assert.equal(preview.finalExpiry, "2027-03-15");
  assert.equal(preview.expiryOverridden, true);
  assert.equal(preview.expiryOverrideReason, "Promotional end date");
  assert.equal(preview.telegramLinked, false);
});

test("warns on exact normalized display-name matches", () => {
  assert.equal(isSimilarDisplayName("Lee O'Connor", "lee oconnor"), true);
});

test("warns on strong display-name containment of at least five characters", () => {
  assert.equal(isSimilarDisplayName("Blackwolf", "Blackwolf Trading"), true);
  assert.equal(isSimilarDisplayName("Lee", "Lee Trading"), false);
});

test("does not warn for unrelated display names", () => {
  assert.equal(isSimilarDisplayName("Alice Example", "Bob Example"), false);
});

test("preserves similar-name acknowledgement in validated data", () => {
  const result = validateNewMemberDraft(paidDraft({ similarNameAcknowledged: true }));
  assert.equal(result.similarNameAcknowledged, true);
});
