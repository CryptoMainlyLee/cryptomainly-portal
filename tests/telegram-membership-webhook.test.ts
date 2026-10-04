import test from "node:test";
import assert from "node:assert/strict";

let webhook: typeof import("../app/api/telegram/_lib/telegram-webhook.ts") | null = null;
try {
  webhook = await import("../app/api/telegram/_lib/telegram-webhook.ts");
} catch {
  webhook = null;
}

let bot: typeof import("../app/api/telegram/_lib/telegram-bot.ts") | null = null;
try {
  bot = await import("../app/api/telegram/_lib/telegram-bot.ts");
} catch {
  bot = null;
}

function api() {
  assert.ok(webhook, "Telegram membership webhook helpers must exist");
  return webhook;
}

const RAW_TOKEN = "A".repeat(43);

function privateStart(overrides: Record<string, unknown> = {}) {
  return {
    update_id: 9001,
    message: {
      message_id: 1,
      from: { id: 123456789, username: "Current_User" },
      chat: { id: 123456789, type: "private" },
      text: `/start ${RAW_TOKEN}`,
    },
    ...overrides,
  };
}

test("parses a valid private start update using Telegram's numeric user identity", () => {
  const result = api().parseTelegramStartUpdate(privateStart());
  assert.deepEqual(result, {
    updateId: 9001,
    chatId: 123456789,
    telegramUserId: 123456789,
    telegramUsername: "Current_User",
    rawToken: RAW_TOKEN,
  });
});

test("accepts /start@BotName and a Telegram user with no username", () => {
  const update = privateStart();
  (update.message.from as Record<string, unknown>).username = undefined;
  update.message.text = `/start@CryptoMainlyMembershipBot ${RAW_TOKEN}`;
  assert.deepEqual(api().parseTelegramStartUpdate(update), {
    updateId: 9001,
    chatId: 123456789,
    telegramUserId: 123456789,
    telegramUsername: null,
    rawToken: RAW_TOKEN,
  });
});

test("ignores group updates, missing sender identity, and unrelated commands", () => {
  const group = privateStart();
  group.message.chat.type = "group";
  assert.equal(api().parseTelegramStartUpdate(group), null);

  const missingFrom = privateStart();
  delete (missingFrom.message as Partial<typeof missingFrom.message>).from;
  assert.equal(api().parseTelegramStartUpdate(missingFrom), null);

  const unrelated = privateStart();
  unrelated.message.text = "/help";
  assert.equal(api().parseTelegramStartUpdate(unrelated), null);
});

test("rejects malformed start payloads and unsafe Telegram integer identifiers", () => {
  const malformed = privateStart();
  malformed.message.text = "/start short-token";
  assert.equal(api().parseTelegramStartUpdate(malformed), null);

  for (const bad of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const badUpdate = privateStart({ update_id: bad });
    assert.equal(api().parseTelegramStartUpdate(badUpdate), null);

    const badUser = privateStart();
    badUser.message.from.id = bad;
    assert.equal(api().parseTelegramStartUpdate(badUser), null);

    const badChat = privateStart();
    badChat.message.chat.id = bad;
    assert.equal(api().parseTelegramStartUpdate(badChat), null);
  }
  assert.equal(api().parseTelegramStartUpdate(null), null);
});

test("validates webhook secret without exposing configured secret material", () => {
  const helpers = api();
  assert.equal(helpers.webhookSecretMatches("Secret_123", "Secret_123"), true);
  assert.equal(helpers.webhookSecretMatches("wrong", "Secret_123"), false);
  assert.equal(helpers.webhookSecretMatches(null, "Secret_123"), false);
  assert.throws(() => helpers.webhookSecretMatches("anything", ""), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /anything|Secret_123/);
    return true;
  });
});


function botApi() {
  assert.ok(bot, "Telegram bot helpers must exist");
  return bot;
}

test("maps only linked/idempotent outcomes to the approved success message", () => {
  const helpers = botApi();
  const success = "Your Telegram account has been successfully verified and linked to CryptoMainly.";
  const failure = "This verification link is no longer valid. Please request a new link from CryptoMainly.";
  assert.equal(helpers.botTextForConsumeResult("LINKED"), success);
  assert.equal(helpers.botTextForConsumeResult("ALREADY_LINKED_IDEMPOTENT"), success);
  for (const code of ["TOKEN_INVALID", "TOKEN_EXPIRED", "MEMBER_BLOCKED", "TELEGRAM_ID_OWNED", "anything-else"]) {
    assert.equal(helpers.botTextForConsumeResult(code), failure);
  }
});

test("builds the exact HTTPS setWebhook registration payload with message updates only", () => {
  const helpers = botApi();
  assert.deepEqual(
    helpers.buildTelegramWebhookRegistration("https://preview.example.com/api/telegram/webhook", "Secret_123"),
    {
      url: "https://preview.example.com/api/telegram/webhook",
      secret_token: "Secret_123",
      allowed_updates: ["message"],
    }
  );
  assert.throws(() => helpers.buildTelegramWebhookRegistration("http://example.com/webhook", "Secret_123"), /https/i);
  assert.throws(() => helpers.buildTelegramWebhookRegistration("https://example.com/webhook", "bad secret"), /secret/i);
});

test("sendMessage uses POST JSON and redacts bot token from failures", async () => {
  const helpers = botApi();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchOk = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  };
  await helpers.sendTelegramBotMessage({ botToken: "123:TOP_SECRET_TOKEN", chatId: 123456789, text: "Hello", fetchImpl: fetchOk });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /api\.telegram\.org\/bot123:TOP_SECRET_TOKEN\/sendMessage$/);
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { chat_id: 123456789, text: "Hello" });

  const fetchFail = async () => new Response("token=123:TOP_SECRET_TOKEN", { status: 500 });
  await assert.rejects(
    () => helpers.sendTelegramBotMessage({ botToken: "123:TOP_SECRET_TOKEN", chatId: 123456789, text: "Hello", fetchImpl: fetchFail }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /TOP_SECRET_TOKEN|123:/);
      return true;
    }
  );
});

type ConsumeInput = {
  tokenHash: string;
  updateId: number;
  telegramUserId: number;
  telegramUsername: string | null;
};

type SendInput = { botToken: string; chatId: number; text: string };

function consumeResult(code: string, replayed = false) {
  return {
    result_code: code,
    member_id: code === "TOKEN_INVALID" ? null : "00000000-0000-4000-8000-000000000001",
    telegram_account_id: code === "LINKED" || code === "ALREADY_LINKED_IDEMPOTENT"
      ? "00000000-0000-4000-8000-000000000002"
      : null,
    linked_at: code === "LINKED" || code === "ALREADY_LINKED_IDEMPOTENT" ? "2026-10-04T12:00:00Z" : null,
    replayed,
  };
}

test("handler validates the webhook secret before parsing or privileged dependencies", async () => {
  const consumeCalls: ConsumeInput[] = [];
  const sendCalls: SendInput[] = [];
  const result = await api().handleTelegramMembershipWebhook(
    { receivedSecret: "wrong", expectedSecret: "Secret_123", rawBody: "not-json-and-sensitive", botToken: "123:BOT_TOKEN" },
    {
      consume: async (input: ConsumeInput) => { consumeCalls.push(input); return consumeResult("LINKED"); },
      sendMessage: async (input: SendInput) => { sendCalls.push(input); },
    }
  );
  assert.deepEqual(result, { status: 401, kind: "unauthorized" });
  assert.equal(consumeCalls.length, 0);
  assert.equal(sendCalls.length, 0);
});

test("handler acknowledges authenticated malformed and irrelevant updates without mutation", async () => {
  let consumeCount = 0;
  let sendCount = 0;
  const deps = {
    consume: async (_input: ConsumeInput) => { consumeCount += 1; return consumeResult("LINKED"); },
    sendMessage: async (_input: SendInput) => { sendCount += 1; },
  };

  const malformed = await api().handleTelegramMembershipWebhook(
    { receivedSecret: "Secret_123", expectedSecret: "Secret_123", rawBody: "not-json", botToken: "123:BOT_TOKEN" },
    deps
  );
  assert.deepEqual(malformed, { status: 200, kind: "ignored" });

  const group = privateStart();
  group.message.chat.type = "group";
  const irrelevant = await api().handleTelegramMembershipWebhook(
    { receivedSecret: "Secret_123", expectedSecret: "Secret_123", rawBody: JSON.stringify(group), botToken: "123:BOT_TOKEN" },
    deps
  );
  assert.deepEqual(irrelevant, { status: 200, kind: "ignored" });
  assert.equal(consumeCount, 0);
  assert.equal(sendCount, 0);
});

test("handler hashes the bearer token, consumes once, and sends the approved success copy", async () => {
  const consumeCalls: ConsumeInput[] = [];
  const sendCalls: SendInput[] = [];
  const result = await api().handleTelegramMembershipWebhook(
    { receivedSecret: "Secret_123", expectedSecret: "Secret_123", rawBody: JSON.stringify(privateStart()), botToken: "123:BOT_TOKEN" },
    {
      consume: async (input: ConsumeInput) => { consumeCalls.push(input); return consumeResult("LINKED"); },
      sendMessage: async (input: SendInput) => { sendCalls.push(input); },
    }
  );
  assert.deepEqual(result, { status: 200, kind: "delivered" });
  assert.equal(consumeCalls.length, 1);
  assert.match(consumeCalls[0].tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(consumeCalls[0].tokenHash, RAW_TOKEN);
  assert.equal(consumeCalls[0].updateId, 9001);
  assert.equal(consumeCalls[0].telegramUserId, 123456789);
  assert.equal(consumeCalls[0].telegramUsername, "Current_User");
  assert.equal(sendCalls.length, 1);
  assert.match(sendCalls[0].text, /successfully verified and linked/i);
});

test("handler treats same-update idempotent replay as success and other consume outcomes generically", async () => {
  const sent: SendInput[] = [];
  const success = await api().handleTelegramMembershipWebhook(
    { receivedSecret: "Secret_123", expectedSecret: "Secret_123", rawBody: JSON.stringify(privateStart()), botToken: "123:BOT_TOKEN" },
    {
      consume: async () => consumeResult("ALREADY_LINKED_IDEMPOTENT", true),
      sendMessage: async (input: SendInput) => { sent.push(input); },
    }
  );
  assert.deepEqual(success, { status: 200, kind: "delivered" });
  assert.match(sent[0].text, /successfully verified and linked/i);

  sent.length = 0;
  const rejected = await api().handleTelegramMembershipWebhook(
    { receivedSecret: "Secret_123", expectedSecret: "Secret_123", rawBody: JSON.stringify(privateStart()), botToken: "123:BOT_TOKEN" },
    {
      consume: async () => consumeResult("TOKEN_CONSUMED"),
      sendMessage: async (input: SendInput) => { sent.push(input); },
    }
  );
  assert.deepEqual(rejected, { status: 200, kind: "delivered" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, "This verification link is no longer valid. Please request a new link from CryptoMainly.");
});

test("handler returns retryable result after committed link when Bot API delivery fails", async () => {
  let consumeCount = 0;
  const result = await api().handleTelegramMembershipWebhook(
    { receivedSecret: "Secret_123", expectedSecret: "Secret_123", rawBody: JSON.stringify(privateStart()), botToken: "123:BOT_TOKEN" },
    {
      consume: async () => { consumeCount += 1; return consumeResult("LINKED"); },
      sendMessage: async () => { throw new Error("Telegram delivery unavailable"); },
    }
  );
  assert.deepEqual(result, { status: 503, kind: "retry" });
  assert.equal(consumeCount, 1);
});

test("handler returns retryable result for transient consume failure without sending a bot message", async () => {
  let sendCount = 0;
  const result = await api().handleTelegramMembershipWebhook(
    { receivedSecret: "Secret_123", expectedSecret: "Secret_123", rawBody: JSON.stringify(privateStart()), botToken: "123:BOT_TOKEN" },
    {
      consume: async () => { throw new Error("database unavailable"); },
      sendMessage: async () => { sendCount += 1; },
    }
  );
  assert.deepEqual(result, { status: 503, kind: "retry" });
  assert.equal(sendCount, 0);
});

test("handler fails closed when the server webhook secret is missing", async () => {
  let consumeCount = 0;
  const result = await api().handleTelegramMembershipWebhook(
    { receivedSecret: "anything", expectedSecret: undefined, rawBody: JSON.stringify(privateStart()), botToken: "123:BOT_TOKEN" },
    {
      consume: async () => { consumeCount += 1; return consumeResult("LINKED"); },
      sendMessage: async () => undefined,
    }
  );
  assert.deepEqual(result, { status: 500, kind: "server_error" });
  assert.equal(consumeCount, 0);
});
