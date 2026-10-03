export const TELEGRAM_REMOVAL_OUTCOMES = [
  "REMOVED_FROM_TELEGRAM",
  "CONFIRMED_NOT_PRESENT_OR_NO_ACCESS",
] as const;

export type TelegramRemovalOutcome = (typeof TELEGRAM_REMOVAL_OUTCOMES)[number];

export const SAFEGUARDING_IDENTIFIER_TYPES = [
  "email",
  "telegram_username",
  "telegram_user_id",
] as const;

export type SafeguardingIdentifierType = (typeof SAFEGUARDING_IDENTIFIER_TYPES)[number];

function validateRequiredText(value: string, maxLength: number, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

export function validateSafeguardingSummary(value: string): string {
  return validateRequiredText(value, 200, "Safeguarding summary");
}

export function validateSafeguardingReason(value: string): string {
  return validateRequiredText(value, 1000, "Safeguarding reason");
}

export function validateTelegramRemovalOutcome(value: string): TelegramRemovalOutcome {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!TELEGRAM_REMOVAL_OUTCOMES.includes(normalized as TelegramRemovalOutcome)) {
    throw new Error("Telegram removal outcome is invalid.");
  }
  return normalized as TelegramRemovalOutcome;
}

export const SAFEGUARDING_RPC_ERROR_CODES = [
  "SAFEGUARDING_STALE_STATE",
  "MEMBER_ALREADY_BLOCKED",
  "MEMBER_NOT_BLOCKED",
  "SAFEGUARDING_CONFIRMATION_REQUIRED",
  "ACCESS_RESTORATION_NOT_REQUIRED",
  "ACCESS_RESTORATION_EXPIRED",
  "SAFEGUARDING_TASK_NOT_OPEN",
  "ACTION_BLOCKED_BY_SAFEGUARDING",
  "PROTECTED_IDENTITY_CONFLICT",
  "SAFEGUARDING_STATE_MISSING",
] as const;

export type SafeguardingRpcErrorCode = (typeof SAFEGUARDING_RPC_ERROR_CODES)[number];
export type SafeguardingActionErrorCode = SafeguardingRpcErrorCode | "SERVER_ERROR";

export function safeguardingRpcErrorCodeFromDetail(detail: string): SafeguardingRpcErrorCode | null {
  return SAFEGUARDING_RPC_ERROR_CODES.find((code) => String(detail ?? "").includes(code)) ?? null;
}

const SAFE_MESSAGES: Record<SafeguardingRpcErrorCode, string> = {
  SAFEGUARDING_STALE_STATE: "This safeguarding record changed after you reviewed it. Refresh and review the current state again.",
  MEMBER_ALREADY_BLOCKED: "This member is already Blocked. Nothing has been changed.",
  MEMBER_NOT_BLOCKED: "This member is not currently Blocked. Nothing has been changed.",
  SAFEGUARDING_CONFIRMATION_REQUIRED: "The required safeguarding confirmation was not provided.",
  ACCESS_RESTORATION_NOT_REQUIRED: "This member does not currently require access restoration.",
  ACCESS_RESTORATION_EXPIRED: "The previous fixed-term entitlement has expired. Use the normal Reactivation workflow if appropriate.",
  SAFEGUARDING_TASK_NOT_OPEN: "That safeguarding task is no longer open. Refresh the member before continuing.",
  ACTION_BLOCKED_BY_SAFEGUARDING: "This action is unavailable because the member's safeguarding state does not permit it.",
  PROTECTED_IDENTITY_CONFLICT: "That identity is already protected for another member. Nothing has been changed.",
  SAFEGUARDING_STATE_MISSING: "The member's safeguarding state is unavailable. Nothing has been changed.",
};

export function safeguardingActionFailureForCode(code: SafeguardingRpcErrorCode | null): {
  ok: false;
  code: SafeguardingActionErrorCode;
  message: string;
} {
  if (!code) {
    return {
      ok: false,
      code: "SERVER_ERROR",
      message: "The safeguarding change could not be saved. Nothing has been changed.",
    };
  }
  return { ok: false, code, message: SAFE_MESSAGES[code] };
}

export type SafeguardingDuplicateSource = "current" | "protected_history" | "display_name";
export type SafeguardingDuplicateState = "blocked" | "previously_blocked" | null;
export type SafeguardingDuplicateErrorCode = "BLOCKED_MEMBER_MATCH" | "PROTECTED_MEMBER_MATCH";

export function safeguardingDuplicateKind(
  source: SafeguardingDuplicateSource,
  state: SafeguardingDuplicateState
): SafeguardingDuplicateErrorCode | null {
  if (source === "display_name") return null;
  if (state === "blocked") return "BLOCKED_MEMBER_MATCH";
  if (source === "protected_history" && state === "previously_blocked") {
    return "PROTECTED_MEMBER_MATCH";
  }
  return null;
}
