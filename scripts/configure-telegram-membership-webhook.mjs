import { pathToFileURL } from "node:url";
import { buildTelegramWebhookRegistration } from "../app/api/telegram/_lib/telegram-bot.ts";

function requireBotToken(botToken) {
  if (typeof botToken !== "string" || !botToken || /\s/.test(botToken)) {
    throw new Error("Telegram bot token is not configured correctly.");
  }
  return botToken;
}

function apiUrl(botToken, method) {
  return `https://api.telegram.org/bot${requireBotToken(botToken)}/${method}`;
}

async function telegramJson(response, operation) {
  if (!response.ok) {
    throw new Error(`Telegram ${operation} failed (${response.status}).`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Telegram ${operation} returned an invalid response.`);
  }
  if (!payload || payload.ok !== true) {
    throw new Error(`Telegram ${operation} was not accepted.`);
  }
  return payload;
}

export function redactedWebhookConfigSummary({ webhookUrl, botToken, webhookSecret }) {
  const registration = buildTelegramWebhookRegistration(webhookUrl, webhookSecret);
  requireBotToken(botToken);
  return {
    webhookUrl: registration.url,
    allowedUpdates: [...registration.allowed_updates],
    botTokenConfigured: true,
    webhookSecretConfigured: true,
  };
}

export async function configureTelegramMembershipWebhook({
  webhookUrl,
  botToken,
  webhookSecret,
  fetchImpl = fetch,
}) {
  const registration = buildTelegramWebhookRegistration(webhookUrl, webhookSecret);
  const token = requireBotToken(botToken);

  const setResponse = await fetchImpl(apiUrl(token, "setWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(registration),
    cache: "no-store",
  });
  await telegramJson(setResponse, "setWebhook");

  const infoResponse = await fetchImpl(apiUrl(token, "getWebhookInfo"), {
    method: "GET",
    cache: "no-store",
  });
  const info = await telegramJson(infoResponse, "getWebhookInfo");
  const actualUrl = typeof info.result?.url === "string" ? info.result.url : "";
  const actualUpdates = Array.isArray(info.result?.allowed_updates)
    ? info.result.allowed_updates
    : [];
  if (
    actualUrl !== registration.url ||
    actualUpdates.length !== 1 ||
    actualUpdates[0] !== "message"
  ) {
    throw new Error("Telegram webhook verification failed.");
  }
  return {
    webhookUrl: actualUrl,
    allowedUpdates: ["message"],
    verified: true,
  };
}

export async function deleteTelegramMembershipWebhook({
  botToken,
  fetchImpl = fetch,
}) {
  const token = requireBotToken(botToken);
  const deleteResponse = await fetchImpl(apiUrl(token, "deleteWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drop_pending_updates: false }),
    cache: "no-store",
  });
  await telegramJson(deleteResponse, "deleteWebhook");

  const infoResponse = await fetchImpl(apiUrl(token, "getWebhookInfo"), {
    method: "GET",
    cache: "no-store",
  });
  const info = await telegramJson(infoResponse, "getWebhookInfo");
  if (typeof info.result?.url !== "string" || info.result.url !== "") {
    throw new Error("Telegram webhook removal verification failed.");
  }
  return { webhookUrl: "", removed: true };
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  const deleting = process.argv.includes("--delete");
  const botToken = requiredEnv("TELEGRAM_MEMBERSHIP_BOT_TOKEN");
  if (deleting) {
    const result = await deleteTelegramMembershipWebhook({ botToken });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const input = {
    webhookUrl: requiredEnv("TELEGRAM_MEMBERSHIP_WEBHOOK_URL"),
    botToken,
    webhookSecret: requiredEnv("TELEGRAM_MEMBERSHIP_WEBHOOK_SECRET"),
  };
  console.log(JSON.stringify(redactedWebhookConfigSummary(input), null, 2));
  const result = await configureTelegramMembershipWebhook(input);
  console.log(JSON.stringify(result, null, 2));
}

const direct = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (direct) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Telegram webhook configuration failed.";
    console.error(message);
    process.exitCode = 1;
  });
}
