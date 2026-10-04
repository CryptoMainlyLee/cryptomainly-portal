import { timingSafeEqual } from "node:crypto";
import { hashTelegramLinkToken, validateTelegramUserId } from "../../../admin/vip/_lib/telegram-linking.ts";
import { botTextForConsumeResult } from "./telegram-bot.ts";

const START_PATTERN = /^\/start(?:@[A-Za-z0-9_]{5,32})?\s+([A-Za-z0-9_-]{43})$/;
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function positiveSafeInteger(value: unknown) {
  try {
    return validateTelegramUserId(value);
  } catch {
    return null;
  }
}

export type ParsedTelegramStart = {
  updateId: number;
  chatId: number;
  telegramUserId: number;
  telegramUsername: string | null;
  rawToken: string;
};

export function parseTelegramStartUpdate(update: unknown): ParsedTelegramStart | null {
  const root = asRecord(update);
  if (!root) return null;
  const updateId = positiveSafeInteger(root.update_id);
  const message = asRecord(root.message);
  if (!updateId || !message) return null;

  const chat = asRecord(message.chat);
  const from = asRecord(message.from);
  if (!chat || !from || chat.type !== "private") return null;

  const chatId = positiveSafeInteger(chat.id);
  const telegramUserId = positiveSafeInteger(from.id);
  if (!chatId || !telegramUserId) return null;

  if (typeof message.text !== "string") return null;
  const match = START_PATTERN.exec(message.text.trim());
  if (!match) return null;

  const username = typeof from.username === "string" && from.username.trim()
    ? from.username.trim()
    : null;

  return {
    updateId,
    chatId,
    telegramUserId,
    telegramUsername: username,
    rawToken: match[1],
  };
}

export function webhookSecretMatches(received: string | null, expected: string | undefined) {
  if (!expected || !WEBHOOK_SECRET_PATTERN.test(expected)) {
    throw new Error("Telegram webhook secret is not configured correctly.");
  }
  if (!received || !WEBHOOK_SECRET_PATTERN.test(received)) return false;

  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (receivedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(receivedBytes, expectedBytes);
}


type ConsumeLinkInput = {
  tokenHash: string;
  updateId: number;
  telegramUserId: number;
  telegramUsername: string | null;
};

type ConsumeLinkResult = {
  result_code: string;
  member_id: string | null;
  telegram_account_id: string | null;
  linked_at: string | null;
  replayed: boolean;
};

type SendMessageInput = {
  botToken: string;
  chatId: number;
  text: string;
};

export type TelegramWebhookDependencies = {
  consume: (input: ConsumeLinkInput) => Promise<ConsumeLinkResult>;
  sendMessage: (input: SendMessageInput) => Promise<void>;
};

export type TelegramWebhookHandlerInput = {
  receivedSecret: string | null;
  expectedSecret: string | undefined;
  rawBody: string;
  botToken: string;
};

export type TelegramWebhookHandlerResult =
  | { status: 200; kind: "ignored" | "delivered" }
  | { status: 401; kind: "unauthorized" }
  | { status: 500; kind: "server_error" }
  | { status: 503; kind: "retry" };

export async function handleTelegramMembershipWebhook(
  input: TelegramWebhookHandlerInput,
  deps: TelegramWebhookDependencies
): Promise<TelegramWebhookHandlerResult> {
  try {
    if (!webhookSecretMatches(input.receivedSecret, input.expectedSecret)) {
      return { status: 401, kind: "unauthorized" };
    }
  } catch {
    return { status: 500, kind: "server_error" };
  }

  let update: unknown;
  try {
    update = JSON.parse(input.rawBody);
  } catch {
    return { status: 200, kind: "ignored" };
  }

  const parsed = parseTelegramStartUpdate(update);
  if (!parsed) return { status: 200, kind: "ignored" };

  let consumeResult: ConsumeLinkResult;
  try {
    consumeResult = await deps.consume({
      tokenHash: hashTelegramLinkToken(parsed.rawToken),
      updateId: parsed.updateId,
      telegramUserId: parsed.telegramUserId,
      telegramUsername: parsed.telegramUsername,
    });
  } catch {
    return { status: 503, kind: "retry" };
  }

  try {
    await deps.sendMessage({
      botToken: input.botToken,
      chatId: parsed.chatId,
      text: botTextForConsumeResult(consumeResult.result_code),
    });
  } catch {
    return { status: 503, kind: "retry" };
  }

  return { status: 200, kind: "delivered" };
}
