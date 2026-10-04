import { consumeTelegramIdentityLink } from "../../../admin/vip/_lib/data.ts";
import { sendTelegramBotMessage } from "../_lib/telegram-bot.ts";
import { handleTelegramMembershipWebhook } from "../_lib/telegram-webhook.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const expectedSecret = process.env.TELEGRAM_MEMBERSHIP_WEBHOOK_SECRET;
  const botToken = process.env.TELEGRAM_MEMBERSHIP_BOT_TOKEN;

  if (!expectedSecret || !botToken) {
    return new Response(null, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const receivedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  const rawBody = await request.text();

  const result = await handleTelegramMembershipWebhook(
    { receivedSecret, expectedSecret, rawBody, botToken },
    {
      consume: consumeTelegramIdentityLink,
      sendMessage: sendTelegramBotMessage,
    }
  );

  return new Response(null, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
