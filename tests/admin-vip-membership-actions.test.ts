import test from "node:test";
import assert from "node:assert/strict";
import {
  addMembershipDuration,
  validateReason,
  validatePositiveWholeNumber,
  validateRenewAmount,
  getMembershipActionEligibility,
  buildChangeExpiryPreview,
  buildAddTimePreview,
  buildRenewPreview,
  normalizeCurrency,
  normalizeOptionalText,
  assertIsoDate,
  membershipEventTitle,
  canConfirmChangeExpiry,
} from "../app/admin/vip/_lib/membership-actions.ts";

test("adds days to an ISO date", () => {
  assert.equal(addMembershipDuration("2026-10-30", 14, "days"), "2026-11-13");
});

test("adds calendar months without drifting month-end", () => {
  assert.equal(addMembershipDuration("2027-01-31", 1, "months"), "2027-02-28");
  assert.equal(addMembershipDuration("2028-01-31", 1, "months"), "2028-02-29");
  assert.equal(addMembershipDuration("2026-08-31", 6, "months"), "2027-02-28");
});

test("adds one calendar interval rather than repeated monthly increments", () => {
  assert.equal(addMembershipDuration("2027-01-31", 2, "months"), "2027-03-31");
});

test("requires a trimmed reason no longer than 500 characters", () => {
  assert.equal(validateReason(" Annual renewal "), "Annual renewal");
  assert.throws(() => validateReason("   "));
  assert.throws(() => validateReason("x".repeat(501)));
});

test("requires positive whole-number durations", () => {
  assert.equal(validatePositiveWholeNumber("12"), 12);
  assert.throws(() => validatePositiveWholeNumber("0"));
  assert.throws(() => validatePositiveWholeNumber("1.5"));
});

test("requires a positive renewal amount", () => {
  assert.equal(validateRenewAmount("500"), 500);
  assert.throws(() => validateRenewAmount("0"));
  assert.throws(() => validateRenewAmount("-1"));
});

test("eligibility allows active paid fixed expiry actions", () => {
  const result = getMembershipActionEligibility({
    status: "ACTIVE",
    entitlementType: "paid",
    expiryMode: "fixed",
    expiresOn: "2026-10-30",
  });
  assert.equal(result.changeExpiry.enabled, true);
  assert.equal(result.addTime.enabled, true);
  assert.deepEqual(result.renew, { enabled: true, mode: "active-renewal" });
});

test("eligibility blocks paid renew for active complimentary fixed expiry", () => {
  const result = getMembershipActionEligibility({
    status: "ACTIVE",
    entitlementType: "complimentary",
    expiryMode: "fixed",
    expiresOn: "2027-02-23",
  });
  assert.equal(result.changeExpiry.enabled, true);
  assert.equal(result.addTime.enabled, true);
  assert.equal(result.renew.enabled, false);
  assert.equal(result.renew.mode, "unavailable");
});

test("eligibility disables fixed-date actions for lifetime/no-expiry", () => {
  const result = getMembershipActionEligibility({
    status: "LIFETIME",
    entitlementType: "lifetime",
    expiryMode: "lifetime",
    expiresOn: null,
  });
  assert.equal(result.changeExpiry.enabled, false);
  assert.equal(result.addTime.enabled, false);
  assert.equal(result.renew.enabled, false);
});

test("eligibility makes former members reactivation-only", () => {
  const result = getMembershipActionEligibility({
    status: "FORMER",
    entitlementType: "paid",
    expiryMode: "fixed",
    expiresOn: "2026-06-01",
  });
  assert.equal(result.changeExpiry.enabled, false);
  assert.equal(result.addTime.enabled, false);
  assert.deepEqual(result.renew, { enabled: true, mode: "reactivation" });
});

test("change expiry preview flags past dates", () => {
  assert.deepEqual(
    buildChangeExpiryPreview({
      currentExpiry: "2026-10-30",
      newExpiry: "2026-08-01",
      todayLondon: "2026-08-23",
    }),
    {
      oldExpiry: "2026-10-30",
      newExpiry: "2026-08-01",
      requiresPastExpiryAcknowledgement: true,
    }
  );
});

test("add time preview calculates authoritative result", () => {
  assert.deepEqual(buildAddTimePreview({ currentExpiry: "2026-10-30", value: 1, unit: "months" }), {
    oldExpiry: "2026-10-30",
    newExpiry: "2026-11-30",
    value: 1,
    unit: "months",
  });
});

test("renew preview handles active renewal and reactivation bases", () => {
  assert.deepEqual(buildRenewPreview({ mode: "active-renewal", baseDate: "2026-10-30", value: 12, unit: "months" }), {
    baseDate: "2026-10-30",
    newExpiry: "2027-10-30",
    value: 12,
    unit: "months",
  });
  assert.deepEqual(buildRenewPreview({ mode: "reactivation", baseDate: "2026-08-23", value: 12, unit: "months" }), {
    baseDate: "2026-08-23",
    newExpiry: "2027-08-23",
    value: 12,
    unit: "months",
  });
});

test("normalizes safe server form values", () => {
  assert.equal(normalizeCurrency(" usdt "), "USDT");
  assert.equal(normalizeOptionalText("  ", 2000), null);
  assert.equal(normalizeOptionalText(" hello ", 2000), "hello");
  assert.equal(assertIsoDate("2026-10-30"), "2026-10-30");
  assert.throws(() => assertIsoDate("30/10/2026"));
});

test("formats membership history event titles", () => {
  assert.equal(membershipEventTitle("LEGACY_RELATIONSHIP_STARTED"), "Original relationship start");
  assert.equal(membershipEventTitle("EXPIRY_CHANGED"), "Expiry changed");
  assert.equal(membershipEventTitle("MEMBERSHIP_TIME_ADDED"), "Membership time added");
  assert.equal(membershipEventTitle("MEMBERSHIP_RENEWED"), "Membership renewed");
  assert.equal(membershipEventTitle("MEMBERSHIP_REACTIVATED"), "Membership reactivated");
  assert.equal(membershipEventTitle("MEMBERSHIP_NOTE_UPDATED"), "Membership note updated");
  assert.equal(membershipEventTitle("SOME_NEW_EVENT"), "Some new event");
});

test("past-expiry confirmation stays disabled until acknowledgement", () => {
  assert.equal(canConfirmChangeExpiry(true, false), false);
  assert.equal(canConfirmChangeExpiry(true, true), true);
  assert.equal(canConfirmChangeExpiry(false, false), true);
});
