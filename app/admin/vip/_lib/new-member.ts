import {
  addMembershipDuration,
  assertIsoDate,
  normalizeCurrency,
  normalizeOptionalText,
  validatePositiveWholeNumber,
  validateReason,
  validateRenewAmount,
  type DurationUnit,
} from "./membership-actions.ts";

export type NewMemberEntitlementType = "paid" | "complimentary" | "trial";

export type NewMemberDraft = {
  displayName: string;
  email: string;
  telegramUsername: string;
  entitlementType: string;
  startDate: string;
  durationValue: string | number;
  durationUnit: string;
  manualExpiry: string;
  expiryOverrideReason: string;
  reason: string;
  amount: string | number;
  currency: string;
  paymentDate: string;
  txHash: string;
  paymentNote: string;
  similarNameAcknowledged: boolean;
};

export type ValidatedNewMemberDraft = {
  displayName: string;
  email: string | null;
  telegramUsername: string | null;
  entitlementType: NewMemberEntitlementType;
  startDate: string;
  durationValue: number;
  durationUnit: DurationUnit;
  calculatedExpiry: string;
  finalExpiry: string;
  expiryOverrideReason: string | null;
  reason: string;
  amount: number | null;
  currency: string | null;
  paymentDate: string | null;
  txHash: string | null;
  paymentNote: string | null;
  similarNameAcknowledged: boolean;
};
export type NewMemberPreview = ValidatedNewMemberDraft & {
  expiryOverridden: boolean;
  telegramLinked: false;
};

export function normalizeDisplayName(value: string): string {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("Display name is required.");
  if (normalized.length > 200) throw new Error("Display name must be 200 characters or fewer.");
  return normalized;
}

export function normalizeEmail(value: string): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Email is invalid.");
  }
  return normalized;
}

export function normalizeTelegramUsername(value: string): string | null {
  let normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (normalized.startsWith("@")) normalized = normalized.slice(1);
  normalized = normalized.toLowerCase();
  if (normalized.length < 5 || normalized.length > 32 || !/^[a-z0-9_]+$/.test(normalized)) {
    throw new Error("Telegram username is invalid.");
  }
  return normalized;
}

function normalizeNameKey(value: string): string {
  return normalizeDisplayName(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSimilarDisplayName(a: string, b: string): boolean {
  const left = normalizeNameKey(a);
  const right = normalizeNameKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return shorter.length >= 5 && longer.includes(shorter);
}
function normalizeDurationUnit(value: string): DurationUnit {
  const unit = String(value ?? "").trim().toLowerCase();
  if (unit !== "days" && unit !== "months") {
    throw new Error("Duration unit must be days or months.");
  }
  return unit;
}

function normalizeEntitlementType(value: string): NewMemberEntitlementType {
  const type = String(value ?? "").trim().toLowerCase();
  if (type !== "paid" && type !== "complimentary" && type !== "trial") {
    throw new Error("Membership type must be Paid, Complimentary or Trial.");
  }
  return type;
}

function hasPaymentData(input: NewMemberDraft): boolean {
  return [input.amount, input.currency, input.paymentDate, input.txHash, input.paymentNote].some(
    (value) => String(value ?? "").trim() !== ""
  );
}

export function validateNewMemberDraft(input: NewMemberDraft): ValidatedNewMemberDraft {
  const displayName = normalizeDisplayName(input.displayName);
  const email = normalizeEmail(input.email);
  const telegramUsername = normalizeTelegramUsername(input.telegramUsername);
  const entitlementType = normalizeEntitlementType(input.entitlementType);
  const startDate = assertIsoDate(input.startDate);
  const durationValue = validatePositiveWholeNumber(input.durationValue);
  const durationUnit = normalizeDurationUnit(input.durationUnit);
  const calculatedExpiry = addMembershipDuration(startDate, durationValue, durationUnit);
  const manualExpiry = normalizeOptionalText(input.manualExpiry, 10);
  const finalExpiry = manualExpiry ? assertIsoDate(manualExpiry) : calculatedExpiry;

  if (finalExpiry <= startDate) {
    throw new Error("Expiry must be after the membership start date.");
  }

  const expiryOverridden = finalExpiry !== calculatedExpiry;
  const expiryOverrideReason = expiryOverridden ? validateReason(input.expiryOverrideReason) : null;
  const reason = validateReason(input.reason);
  let amount: number | null = null;
  let currency: string | null = null;
  let paymentDate: string | null = null;
  let txHash: string | null = null;
  let paymentNote: string | null = null;

  if (entitlementType === "paid") {
    amount = validateRenewAmount(input.amount);
    currency = normalizeCurrency(input.currency);
    const normalizedPaymentDate = normalizeOptionalText(input.paymentDate, 10);
    paymentDate = normalizedPaymentDate ? assertIsoDate(normalizedPaymentDate) : null;
    txHash = normalizeOptionalText(input.txHash, 300);
    paymentNote = normalizeOptionalText(input.paymentNote, 2000);
  } else if (hasPaymentData(input)) {
    throw new Error("Complimentary and Trial memberships cannot contain payment data.");
  }

  return {
    displayName,
    email,
    telegramUsername,
    entitlementType,
    startDate,
    durationValue,
    durationUnit,
    calculatedExpiry,
    finalExpiry,
    expiryOverrideReason,
    reason,
    amount,
    currency,
    paymentDate,
    txHash,
    paymentNote,
    similarNameAcknowledged: Boolean(input.similarNameAcknowledged),
  };
}

export function buildNewMemberPreview(input: NewMemberDraft): NewMemberPreview {
  const validated = validateNewMemberDraft(input);
  return {
    ...validated,
    expiryOverridden: validated.finalExpiry !== validated.calculatedExpiry,
    telegramLinked: false,
  };
}

export type NewMemberDuplicateMatch = {
  memberId: string;
  displayName: string;
  field: "email" | "telegram";
  matchSource: "current" | "protected_history";
  safeguarding: "blocked" | "previously_blocked" | null;
};

export type NewMemberRpcErrorCode =
  | "INVALID_INPUT"
  | "DUPLICATE_EMAIL"
  | "DUPLICATE_TELEGRAM"
  | "DUPLICATE_TX_HASH"
  | "BLOCKED_MEMBER_MATCH"
  | "PROTECTED_MEMBER_MATCH";

export function newMemberRpcErrorCodeFromDetail(detail: string): NewMemberRpcErrorCode | null {
  const codes: NewMemberRpcErrorCode[] = [
    "BLOCKED_MEMBER_MATCH",
    "PROTECTED_MEMBER_MATCH",
    "DUPLICATE_EMAIL",
    "DUPLICATE_TELEGRAM",
    "DUPLICATE_TX_HASH",
    "INVALID_INPUT",
  ];
  return codes.find((code) => String(detail ?? "").includes(code)) ?? null;
}

export function requiresSimilarNameAcknowledgement(
  similarMatchCount: number,
  acknowledged: boolean
): boolean {
  return similarMatchCount > 0 && !acknowledged;
}
