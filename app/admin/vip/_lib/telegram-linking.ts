import { createHash, randomBytes } from "node:crypto";

export const TELEGRAM_LINK_TTL_HOURS = 24;

export const TELEGRAM_LINK_RPC_ERROR_CODES = [
  "TELEGRAM_LINK_STALE_STATE",
  "TELEGRAM_LINK_MEMBER_INELIGIBLE",
  "TELEGRAM_LINK_MEMBER_BLOCKED",
  "TELEGRAM_LINK_ALREADY_VERIFIED",
  "TELEGRAM_LINK_STATE_MISSING",
] as const;

export type TelegramLinkRpcErrorCode = (typeof TELEGRAM_LINK_RPC_ERROR_CODES)[number];
export type TelegramLinkUiState = "not_linked" | "pending" | "verified" | "unavailable";

const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;

export function hashTelegramLinkToken(rawToken: string) {
  if (!RAW_TOKEN_PATTERN.test(rawToken)) {
    throw new Error("Invalid Telegram linking token.");
  }
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function createTelegramLinkCredential(botUsername: string) {
  const normalizedBotUsername = botUsername.trim().replace(/^@/, "");
  if (!BOT_USERNAME_PATTERN.test(normalizedBotUsername)) {
    throw new Error("Invalid Telegram bot username.");
  }
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashTelegramLinkToken(rawToken);
  return {
    rawToken,
    tokenHash,
    deepLink: `https://t.me/${normalizedBotUsername}?start=${rawToken}`,
  };
}

export function validateTelegramUserId(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Invalid Telegram user ID.");
  }
  return value;
}
export function telegramLinkRpcErrorCodeFromDetail(detail: string): TelegramLinkRpcErrorCode | null {
  return TELEGRAM_LINK_RPC_ERROR_CODES.find((code) => detail.includes(code)) ?? null;
}

const ERROR_MESSAGES: Record<TelegramLinkRpcErrorCode, string> = {
  TELEGRAM_LINK_STALE_STATE: "Member safeguarding state changed. Refresh the record and review it before generating a new Telegram link.",
  TELEGRAM_LINK_MEMBER_INELIGIBLE: "Telegram identity linking is available only for a current ACTIVE or LIFETIME member.",
  TELEGRAM_LINK_MEMBER_BLOCKED: "Telegram identity linking is unavailable while this member is Blocked.",
  TELEGRAM_LINK_ALREADY_VERIFIED: "This member already has a verified Telegram identity. Automatic replacement is not allowed.",
  TELEGRAM_LINK_STATE_MISSING: "Telegram linking cannot continue because the required safeguarding state is unavailable.",
};

export function telegramLinkActionFailureForCode(code: TelegramLinkRpcErrorCode | null) {
  if (!code) {
    return {
      ok: false as const,
      code: "SERVER_ERROR" as const,
      message: "Telegram linking could not be completed. Refresh and try again.",
    };
  }
  return { ok: false as const, code, message: ERROR_MESSAGES[code] };
}

export function telegramLinkUiState(input: {
  membershipStatus: "ACTIVE" | "FORMER" | "LIFETIME" | null;
  isBlocked: boolean;
  telegramUserId: number | null;
  pendingExpiresAt: string | null;
  now?: string;
}): TelegramLinkUiState {
  if (input.telegramUserId !== null) return "verified";
  if (input.isBlocked || (input.membershipStatus !== "ACTIVE" && input.membershipStatus !== "LIFETIME")) {
    return "unavailable";
  }
  if (input.pendingExpiresAt) {
    const expires = Date.parse(input.pendingExpiresAt);
    const now = Date.parse(input.now ?? new Date().toISOString());
    if (Number.isFinite(expires) && Number.isFinite(now) && expires > now) return "pending";
  }
  return "not_linked";
}
