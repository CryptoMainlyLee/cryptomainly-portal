import {
  assertIsoDate,
  normalizeCurrency,
  normalizeOptionalText,
} from "./membership-actions.ts";
import {
  normalizeDisplayName,
  normalizeEmail,
  normalizeTelegramUsername,
} from "./new-member.ts";

export type MarketingStatus = "unknown" | "allowed" | "opted_out";
export type EditableEntitlementType = "paid" | "complimentary" | "trial" | "lifetime" | "admin";
export type EditableExpiryMode = "fixed" | "lifetime" | "manual_no_expiry";
export type EditablePaymentStatus = "pending" | "verified" | "rejected" | "refunded";

export type Change = { field: string; before: unknown; after: unknown };

export type MemberDetailsDraft = {
  displayName: string;
  email: string | null;
  firstJoinedOn: string | null;
  adminNotes: string | null;
  marketingStatus: string;
};

export type TelegramUsernameDraft = { telegramUsername: string | null };

export type MembershipPeriodDraft = {
  entitlementType: string;
  planName: string | null;
  startsOn: string | null;
  expiresOn: string | null;
  expiryMode: string;
  removalProtected: boolean;
  protectionReason: string | null;
  endedEarlyOn: string | null;
  adminNote: string | null;
};

export type PaymentDraft = {
  amount: string | number | null;
  currency: string | null;
  network: string | null;
  txHash: string | null;
  status: string;
  receivedAt: string | null;
  notes: string | null;
};

function assertAllowedKeys(input: object, allowed: readonly string[], label: string) {
  const unexpected = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new Error(`${label} contains unsupported or protected fields.`);
}

function optionalIsoDate(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  return text ? assertIsoDate(text) : null;
}

export function buildChangeSet<T extends Record<string, unknown>>(before: T, after: T): Change[] {
  const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  return fields
    .filter((field) => !Object.is(before[field], after[field]))
    .map((field) => ({ field, before: before[field], after: after[field] }));
}

export function assertHasChanges(changes: readonly Change[]): void {
  if (changes.length === 0) throw new Error("No changes were made.");
}

const STRUCTURAL_FIELDS = new Set([
  "first_joined_on",
  "entitlement_type",
  "starts_on",
  "expires_on",
  "expiry_mode",
  "removal_protected",
  "protection_reason",
  "ended_early_on",
  "plan_name",
  "admin_note",
  "amount",
  "status",
  "received_at",
  "tx_hash",
]);

export function requiresStructuralReason(fields: readonly string[]): boolean {
  return fields.some((field) => STRUCTURAL_FIELDS.has(field));
}

export function validateMemberDetailsDraft(input: MemberDetailsDraft) {
  assertAllowedKeys(input, ["displayName", "email", "firstJoinedOn", "adminNotes", "marketingStatus"], "Member draft");
  const marketingStatus = String(input.marketingStatus ?? "").trim().toLowerCase();
  if (!(["unknown", "allowed", "opted_out"] as const).includes(marketingStatus as MarketingStatus)) {
    throw new Error("Marketing status is invalid.");
  }
  return {
    displayName: normalizeDisplayName(input.displayName),
    email: normalizeEmail(String(input.email ?? "")),
    firstJoinedOn: optionalIsoDate(input.firstJoinedOn),
    adminNotes: normalizeOptionalText(String(input.adminNotes ?? ""), 4000),
    marketingStatus: marketingStatus as MarketingStatus,
  };
}

export function validateTelegramUsernameDraft(input: TelegramUsernameDraft) {
  assertAllowedKeys(input, ["telegramUsername"], "Telegram draft");
  return { telegramUsername: normalizeTelegramUsername(String(input.telegramUsername ?? "")) };
}

function normalizeEntitlement(value: string): EditableEntitlementType {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!(["paid", "complimentary", "trial", "lifetime", "admin"] as const).includes(normalized as EditableEntitlementType)) {
    throw new Error("Entitlement type is invalid.");
  }
  return normalized as EditableEntitlementType;
}

function normalizeExpiryMode(value: string): EditableExpiryMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!(["fixed", "lifetime", "manual_no_expiry"] as const).includes(normalized as EditableExpiryMode)) {
    throw new Error("Expiry mode is invalid.");
  }
  return normalized as EditableExpiryMode;
}

export function validateMembershipPeriodDraft(input: MembershipPeriodDraft) {
  assertAllowedKeys(input, [
    "entitlementType", "planName", "startsOn", "expiresOn", "expiryMode",
    "removalProtected", "protectionReason", "endedEarlyOn", "adminNote",
  ], "Membership period draft");

  const entitlementType = normalizeEntitlement(input.entitlementType);
  const expiryMode = normalizeExpiryMode(input.expiryMode);
  const startsOn = optionalIsoDate(input.startsOn);
  const expiresOn = optionalIsoDate(input.expiresOn);
  const endedEarlyOn = optionalIsoDate(input.endedEarlyOn);
  const planName = normalizeOptionalText(String(input.planName ?? ""), 200);
  let protectionReason = normalizeOptionalText(String(input.protectionReason ?? ""), 500);
  const adminNote = normalizeOptionalText(String(input.adminNote ?? ""), 4000);
  const removalProtected = Boolean(input.removalProtected);

  if (removalProtected && !protectionReason) throw new Error("A protection reason is required.");
  if (!removalProtected) protectionReason = null;
  if (expiryMode !== "fixed" && expiresOn !== null) {
    throw new Error("Lifetime and no-expiry memberships cannot have a fixed expiry date.");
  }
  if (startsOn && expiresOn && expiresOn <= startsOn) {
    throw new Error("Membership expiry must be after the start date.");
  }
  if (endedEarlyOn && startsOn && endedEarlyOn < startsOn) {
    throw new Error("Ended-early date cannot be before the membership start date.");
  }
  if (endedEarlyOn && expiresOn && endedEarlyOn > expiresOn) {
    throw new Error("Ended-early date cannot be after the membership expiry date.");
  }

  return {
    entitlementType,
    planName,
    startsOn,
    expiresOn,
    expiryMode,
    removalProtected,
    protectionReason,
    endedEarlyOn,
    adminNote,
  };
}

function normalizePaymentStatus(value: string): EditablePaymentStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!(["pending", "verified", "rejected", "refunded"] as const).includes(normalized as EditablePaymentStatus)) {
    throw new Error("Payment status is invalid.");
  }
  return normalized as EditablePaymentStatus;
}

function optionalAmount(value: string | number | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount must be greater than zero.");
  return amount;
}

function optionalCurrency(value: string | null): string | null {
  const text = String(value ?? "").trim();
  return text ? normalizeCurrency(text) : null;
}

function optionalReceivedAt(value: string | null): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) {
    throw new Error("Payment received time must include a timezone offset.");
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error("Payment received time is invalid.");
  return date.toISOString();
}

export function validatePaymentDraft(input: PaymentDraft) {
  assertAllowedKeys(input, ["amount", "currency", "network", "txHash", "status", "receivedAt", "notes"], "Payment draft");
  return {
    amount: optionalAmount(input.amount),
    currency: optionalCurrency(input.currency),
    network: normalizeOptionalText(String(input.network ?? ""), 100),
    txHash: normalizeOptionalText(String(input.txHash ?? ""), 300),
    status: normalizePaymentStatus(input.status),
    receivedAt: optionalReceivedAt(input.receivedAt),
    notes: normalizeOptionalText(String(input.notes ?? ""), 2000),
  };
}

const LONDON_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function londonWallTime(date: Date): string {
  const parts = Object.fromEntries(
    LONDON_FORMATTER.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function parseLocalWallTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("London local time is invalid.");
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const naive = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (naive.getUTCFullYear() !== year || naive.getUTCMonth() !== month - 1 ||
      naive.getUTCDate() !== day || naive.getUTCHours() !== hour || naive.getUTCMinutes() !== minute) {
    throw new Error("London local time is invalid.");
  }
  return naive.getTime();
}

export function londonLocalDateTimeToIso(value: string | null): string | null {
  const wall = String(value ?? "").trim();
  if (!wall) return null;
  const naiveMs = parseLocalWallTime(wall);
  const candidates: number[] = [];

  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidateMs = naiveMs - offsetMinutes * 60_000;
    if (londonWallTime(new Date(candidateMs)) === wall) candidates.push(candidateMs);
  }
  const unique = Array.from(new Set(candidates));
  if (unique.length !== 1) {
    throw new Error(unique.length === 0
      ? "London local time is invalid during a DST transition."
      : "London local time is ambiguous/non-unique during a DST transition.");
  }
  return new Date(unique[0]).toISOString();
}

export function isoToLondonLocalDateTime(value: string | null): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) throw new Error("Timestamp must include a timezone offset.");
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error("Timestamp is invalid.");
  return londonWallTime(date);
}
