import test from "node:test";
import assert from "node:assert/strict";
import {
  REVIEW_CATEGORIES,
  REVIEW_RESOLUTION_OUTCOMES,
  detectReviewConcerns,
  validateReviewOpenDraft,
  validateReviewResolutionDraft,
} from "../app/admin/vip/_lib/review-cases.ts";

test("opening Review requires a supported category and non-empty reason", () => {
  assert.deepEqual(validateReviewOpenDraft({ category: "membership", reason: " Confirm dates " }), {
    category: "membership",
    reason: "Confirm dates",
  });
  assert.throws(() => validateReviewOpenDraft({ category: "membership", reason: "" }), /reason/i);
  assert.throws(() => validateReviewOpenDraft({ category: "unknown", reason: "Check" }), /category/i);
  assert.throws(
    () => validateReviewOpenDraft({ category: "other", reason: "x".repeat(501) }),
    /500/
  );
  assert.deepEqual(REVIEW_CATEGORIES, [
    "identity_contact", "membership", "payment", "telegram", "historical", "other",
  ]);
});

test("Review resolution requires one exact outcome and a note", () => {
  for (const outcome of REVIEW_RESOLUTION_OUTCOMES) {
    const result = validateReviewResolutionDraft({ outcome, note: " Reviewed carefully " });
    assert.equal(result.outcome, outcome);
    assert.equal(result.note, "Reviewed carefully");
  }
});

test("historical unknown acceptance does not require invented structured facts", () => {
  const result = validateReviewResolutionDraft({
    outcome: "HISTORICAL_DETAIL_UNKNOWN_ACCEPTED",
    note: "Exact legacy start date cannot be established",
  });
  assert.equal(result.outcome, "HISTORICAL_DETAIL_UNKNOWN_ACCEPTED");
  assert.equal(result.note, "Exact legacy start date cannot be established");
  assert.throws(
    () => validateReviewResolutionDraft({ outcome: "HISTORICAL_DETAIL_UNKNOWN_ACCEPTED", note: "" }),
    /note/i
  );
  assert.throws(
    () => validateReviewResolutionDraft({ outcome: "NOT_REAL", note: "Reviewed" }),
    /outcome/i
  );
});

test("a later Review open draft is independent of an earlier resolution", () => {
  const resolved = validateReviewResolutionDraft({
    outcome: "EXISTING_DATA_CONFIRMED",
    note: "Current data confirmed",
  });
  const reopened = validateReviewOpenDraft({ category: "telegram", reason: "Username changed later" });
  assert.equal(resolved.outcome, "EXISTING_DATA_CONFIRMED");
  assert.deepEqual(reopened, { category: "telegram", reason: "Username changed later" });
});

test("concern detection flags only deterministic membership concerns", () => {
  const concerns = detectReviewConcerns({
    firstJoinedOn: "2025-12-14",
    entitlementType: "paid",
    startsOn: null,
    expiresOn: "2025-03-15",
    expiryMode: "fixed",
    removalProtected: false,
  });
  const codes = concerns.map((concern) => concern.code);
  assert.ok(codes.includes("MISSING_MEMBERSHIP_START"));
  assert.ok(codes.includes("RELATIONSHIP_AFTER_EXPIRY"));
  assert.equal(codes.includes("INDEFINITE_COMPLIMENTARY_CONFIRMATION"), false);
});

test("concern detection flags impossible known date order", () => {
  const concerns = detectReviewConcerns({
    firstJoinedOn: null,
    entitlementType: "paid",
    startsOn: "2026-05-01",
    expiresOn: "2026-05-01",
    expiryMode: "fixed",
    removalProtected: false,
  });
  assert.ok(concerns.some((concern) => concern.code === "INVALID_MEMBERSHIP_DATE_ORDER"));
});

test("protected indefinite complimentary access is surfaced for confirmation", () => {
  const concerns = detectReviewConcerns({
    firstJoinedOn: null,
    entitlementType: "complimentary",
    startsOn: null,
    expiresOn: null,
    expiryMode: "manual_no_expiry",
    removalProtected: true,
  });
  assert.ok(
    concerns.some((concern) => concern.code === "INDEFINITE_COMPLIMENTARY_CONFIRMATION")
  );
});

test("clean known membership facts do not create speculative concerns", () => {
  assert.deepEqual(
    detectReviewConcerns({
      firstJoinedOn: "2026-01-01",
      entitlementType: "paid",
      startsOn: "2026-01-01",
      expiresOn: "2027-01-01",
      expiryMode: "fixed",
      removalProtected: false,
    }),
    []
  );
});

test("Review opening and resolution notes accept 500 characters and reject 501", () => {
  assert.equal(
    validateReviewOpenDraft({ category: "other", reason: "x".repeat(500) }).reason.length,
    500
  );
  assert.equal(
    validateReviewResolutionDraft({ outcome: "EXISTING_DATA_CONFIRMED", note: "x".repeat(500) }).note.length,
    500
  );
  assert.throws(
    () => validateReviewResolutionDraft({ outcome: "EXISTING_DATA_CONFIRMED", note: "x".repeat(501) }),
    /500/
  );
});
