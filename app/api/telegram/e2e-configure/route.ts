import { buildTelegramWebhookRegistration } from "../_lib/telegram-bot.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, body?: Record<string, unknown>) {
  return body
    ? Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
    : new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

async function telegramJson(response: Response) {
  if (!response.ok) throw new Error("Telegram API request failed.");
  const payload = await response.json();
  if (!payload || payload.ok !== true) throw new Error("Telegram API rejected request.");
  return payload;
}

export async function GET(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV !== "preview") return noStore(404);
  if (process.env.VERCEL_GIT_COMMIT_REF !== "feature/telegram-identity-linking-2026-10-04") {
    return noStore(404);
  }

  const operatorSecret = process.env.E2E_TELEGRAM_OPERATOR_SECRET;
  const requestKey = new URL(request.url).searchParams.get("key");
  if (!operatorSecret || requestKey !== operatorSecret) {
    return noStore(401);
  }

  const token = process.env.TELEGRAM_MEMBERSHIP_BOT_TOKEN;
  const secret = process.env.TELEGRAM_MEMBERSHIP_WEBHOOK_SECRET;
  const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!token || !secret || !protectionBypass) return noStore(500);

  const webhookUrl = new URL("/api/telegram/webhook", request.url);
  webhookUrl.searchParams.set("x-vercel-protection-bypass", protectionBypass);
  const registration = {
    ...buildTelegramWebhookRegistration(webhookUrl.toString(), secret),
    drop_pending_updates: true,
  };

  try {
    const setResponse = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registration),
      cache: "no-store",
    });
    await telegramJson(setResponse);

    const infoResponse = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      method: "GET",
      cache: "no-store",
    });
    const info = await telegramJson(infoResponse);
    const actualUrl = typeof info.result?.url === "string" ? info.result.url : "";
    const actualUpdates = Array.isArray(info.result?.allowed_updates)
      ? info.result.allowed_updates
      : [];

    if (
      actualUrl !== registration.url ||
      actualUpdates.length !== 1 ||
      actualUpdates[0] !== "message"
    ) {
      return noStore(502);
    }

    return noStore(200, {
      verified: true,
      allowedUpdates: ["message"],
    });
  } catch {
    return noStore(502);
  }
}
