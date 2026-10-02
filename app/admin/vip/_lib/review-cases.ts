import { assertIsoDate, validateReason } from "./membership-actions.ts";

export const REVIEW_CATEGORIES = [
  "identity_contact",
  "membership",
  "payment",
  "telegram",
  "historical",
  "other",
] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export const REVIEW_RESOLUTION_OUTCOMES = [
  "CORRECTED_DATA_UPDATED",
  "EXISTING_DATA_CONFIRMED",
  "HISTORICAL_DETAIL_UNKNOWN_ACCEPTED",
] as const;
export type ReviewResolutionOutcome = (typeof REVIEW_RESOLUTION_OUTCOMES)[number];
export type ReviewOrigin = "legacy_migration" | "manual" | "add_member";
export type ReviewStatus = "OPEN" | "RESOLVED";

export type ReviewOpenDraft = { category: string; reason: string };
export type ReviewResolutionDraft = { outcome: string; note: string };

export function validateReviewOpenDraft(input: ReviewOpenDraft) {
  const category = String(input.category ?? "").trim().toLowerCase();
  if (!REVIEW_CATEGORIES.includes(category as ReviewCategory)) {
    throw new Error("Review category is invalid.");
  }
  return {
    category: category as ReviewCategory,
    reason: validateReason(input.reason),
  };
}

export function validateReviewResolutionDraft(input: ReviewResolutionDraft) {
  const outcome = String(input.outcome ?? "").trim().toUpperCase();
  if (!REVIEW_RESOLUTION_OUTCOMES.includes(outcome as ReviewResolutionOutcome)) {
    throw new Error("Review resolution outcome is invalid.");
  }
  const note = String(input.note ?? "").trim();
  if (!note) throw new Error("A resolution note is required.");
  if (note.length > 500) throw new Error("Resolution note must be 500 characters or fewer.");
  return { outcome: outcome as ReviewResolutionOutcome, note };
}

export type ReviewConcernCode =
  | "MISSING_MEMBERSHIP_START"
  | "INVALID_MEMBERSHIP_DATE_ORDER"
  | "RELATIONSHIP_AFTER_EXPIRY"
  | "INDEFINITE_COMPLIMENTARY_CONFIRMATION";

export type ReviewConcern = {
  code: ReviewConcernCode;
  category: ReviewCategory;
  message: string;
};

export type ReviewConcernInput = {
  firstJoinedOn: string | null;
  entitlementType: "paid" | "complimentary" | "trial" | "lifetime" | "admin" | null;
  startsOn: string | null;
  expiresOn: string | null;
  expiryMode: "fixed" | "lifetime" | "manual_no_expiry" | null;
  removalProtected: boolean;
};

function knownDate(value: string | null): string | null {
  return value ? assertIsoDate(value) : null;
}

export function detectReviewConcerns(input: ReviewConcernInput): ReviewConcern[] {
  const concerns: ReviewConcern[] = [];
  const firstJoinedOn = knownDate(input.firstJoinedOn);
  const startsOn = knownDate(input.startsOn);
  const expiresOn = knownDate(input.expiresOn);

  if (!startsOn) {
    concerns.push({
      code: "MISSING_MEMBERSHIP_START",
      category: "historical",
      message: "Membership start date is not recorded.",
    });
  }

  if (startsOn && expiresOn && expiresOn <= startsOn) {
    concerns.push({
      code: "INVALID_MEMBERSHIP_DATE_ORDER",
      category: "historical",
      message: "Recorded membership expiry is not after the recorded start date.",
    });
  }
  if (firstJoinedOn && expiresOn && firstJoinedOn > expiresOn) {
    concerns.push({
      code: "RELATIONSHIP_AFTER_EXPIRY",
      category: "historical",
      message: "First joined date occurs after the recorded membership expiry.",
    });
  }
  if (
    input.entitlementType === "complimentary" &&
    input.expiryMode === "manual_no_expiry" &&
    input.removalProtected
  ) {
    concerns.push({
      code: "INDEFINITE_COMPLIMENTARY_CONFIRMATION",
      category: "membership",
      message: "Protected indefinite complimentary access requires confirmation.",
    });
  }
  return concerns;
}
