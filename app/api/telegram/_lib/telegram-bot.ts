const SUCCESS_TEXT = "Your Telegram account has been successfully verified and linked to CryptoMainly.";
const INVALID_LINK_TEXT = "This verification link is no longer valid. Please request a new link from CryptoMainly.";
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

export function botTextForConsumeResult(code: string) {
  return code === "LINKED" || code === "ALREADY_LINKED_IDEMPOTENT"
    ? SUCCESS_TEXT
    : INVALID_LINK_TEXT;
}

export function buildTelegramWebhookRegistration(url: string, secret: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Telegram webhook URL must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Telegram webhook URL must use HTTPS.");
  }
  if (!WEBHOOK_SECRET_PATTERN.test(secret)) {
    throw new Error("Telegram webhook secret is invalid.");
  }
  return {
    url: parsed.toString(),
    secret_token: secret,
    allowed_updates: ["message"] as const,
  };
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export async function sendTelegramBotMessage(input: {
  botToken: string;
  chatId: number;
  text: string;
  fetchImpl?: FetchLike;
}) {
  if (!input.botToken || /\s/.test(input.botToken)) {
    throw new Error("Telegram bot token is not configured correctly.");
  }
  if (!Number.isSafeInteger(input.chatId) || input.chatId <= 0) {
    throw new Error("Invalid Telegram chat ID.");
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.telegram.org/bot${input.botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: input.chatId, text: input.text }),
      cache: "no-store",
    }
  );
  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed (${response.status}).`);
  }
}
