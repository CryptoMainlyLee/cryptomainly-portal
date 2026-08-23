export type DurationUnit = "days" | "months";

export type ActionEligibility = {
  changeExpiry: { enabled: boolean; reason?: string };
  addTime: { enabled: boolean; reason?: string };
  renew: {
    enabled: boolean;
    mode: "active-renewal" | "reactivation" | "unavailable";
    reason?: string;
  };
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(value: string) {
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error("Date must use YYYY-MM-DD format.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Date is not valid.");
  }
  return { year, month, day };
}

function formatIsoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function assertIsoDate(value: string): string {
  const trimmed = String(value ?? "").trim();
  parseIsoDate(trimmed);
  return trimmed;
}

export function addMembershipDuration(
  baseDate: string,
  value: number,
  unit: DurationUnit
): string {
  const { year, month, day } = parseIsoDate(assertIsoDate(baseDate));
  const duration = validatePositiveWholeNumber(value);

  if (unit === "days") {
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + duration);
    return formatIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  if (unit !== "months") throw new Error("Duration unit must be days or months.");

  const targetIndex = year * 12 + (month - 1) + duration;
  const targetYear = Math.floor(targetIndex / 12);
  const targetMonthIndex = targetIndex % 12;
  const targetLastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, targetLastDay);
  return formatIsoDate(targetYear, targetMonthIndex + 1, targetDay);
}

export function validateReason(value: string): string {
  const reason = String(value ?? "").trim();
  if (!reason) throw new Error("A reason is required.");
  if (reason.length > 500) throw new Error("Reason must be 500 characters or fewer.");
  return reason;
}

export function validatePositiveWholeNumber(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Duration must be a positive whole number.");
  }
  return parsed;
}

export function validateRenewAmount(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Renewal amount must be greater than zero.");
  }
  return parsed;
}

export function normalizeCurrency(value: string): string {
  const currency = String(value ?? "").trim().toUpperCase();
  if (!currency || currency.length > 12 || !/^[A-Z0-9_-]+$/.test(currency)) {
    throw new Error("Currency is invalid.");
  }
  return currency;
}

export function normalizeOptionalText(value: string, maxLength: number): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new Error(`Text must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

export function getMembershipActionEligibility(input: {
  status: "ACTIVE" | "FORMER" | "LIFETIME";
  entitlementType: "paid" | "complimentary" | "trial" | "lifetime" | "admin" | null;
  expiryMode: "fixed" | "lifetime" | "manual_no_expiry" | null;
  expiresOn: string | null;
}): ActionEligibility {
  if (input.status === "FORMER") {
    return {
      changeExpiry: { enabled: false, reason: "Former members are changed through Renew / Reactivate." },
      addTime: { enabled: false, reason: "Former members are changed through Renew / Reactivate." },
      renew: { enabled: true, mode: "reactivation" },
    };
  }

  if (input.status === "LIFETIME" || input.expiryMode !== "fixed" || !input.expiresOn) {
    return {
      changeExpiry: { enabled: false, reason: "This entitlement has no fixed expiry date." },
      addTime: { enabled: false, reason: "This entitlement has no fixed expiry date." },
      renew: { enabled: false, mode: "unavailable", reason: "Paid renewal is unavailable for this entitlement." },
    };
  }

  const paidRenewalAllowed = input.status === "ACTIVE" && input.entitlementType === "paid";
  return {
    changeExpiry: { enabled: true },
    addTime: { enabled: true },
    renew: paidRenewalAllowed
      ? { enabled: true, mode: "active-renewal" }
      : {
          enabled: false,
          mode: "unavailable",
          reason: "Paid Renew is currently limited to active paid memberships.",
        },
  };
}

export function buildChangeExpiryPreview(input: {
  currentExpiry: string;
  newExpiry: string;
  todayLondon: string;
}) {
  const oldExpiry = assertIsoDate(input.currentExpiry);
  const newExpiry = assertIsoDate(input.newExpiry);
  const todayLondon = assertIsoDate(input.todayLondon);
  return {
    oldExpiry,
    newExpiry,
    requiresPastExpiryAcknowledgement: newExpiry < todayLondon,
  };
}

export function buildAddTimePreview(input: {
  currentExpiry: string;
  value: number;
  unit: DurationUnit;
}) {
  const value = validatePositiveWholeNumber(input.value);
  const oldExpiry = assertIsoDate(input.currentExpiry);
  return {
    oldExpiry,
    newExpiry: addMembershipDuration(oldExpiry, value, input.unit),
    value,
    unit: input.unit,
  };
}

export function buildRenewPreview(input: {
  mode: "active-renewal" | "reactivation";
  baseDate: string;
  value: number;
  unit: DurationUnit;
}) {
  const value = validatePositiveWholeNumber(input.value);
  const baseDate = assertIsoDate(input.baseDate);
  return {
    baseDate,
    newExpiry: addMembershipDuration(baseDate, value, input.unit),
    value,
    unit: input.unit,
  };
}

const EVENT_TITLES: Record<string, string> = {
  LEGACY_RELATIONSHIP_STARTED: "Original relationship start",
  EXPIRY_CHANGED: "Expiry changed",
  MEMBERSHIP_TIME_ADDED: "Membership time added",
  MEMBERSHIP_RENEWED: "Membership renewed",
  MEMBERSHIP_REACTIVATED: "Membership reactivated",
  MEMBERSHIP_NOTE_UPDATED: "Membership note updated",
  HISTORICAL_PERIOD_RECONSTRUCTED: "Historical membership reconstructed",
  MIGRATED: "Migrated",
};

export function membershipEventTitle(eventType: string): string {
  if (EVENT_TITLES[eventType]) return EVENT_TITLES[eventType];
  const words = eventType.toLowerCase().replace(/_/g, " ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Membership event";
}
