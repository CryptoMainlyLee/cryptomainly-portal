export type TelegramWebhookOperationInput = {
  webhookUrl: string;
  botToken: string;
  webhookSecret: string;
  fetchImpl?: typeof fetch;
};

export type TelegramWebhookDeleteInput = {
  botToken: string;
  fetchImpl?: typeof fetch;
};

export function redactedWebhookConfigSummary(input: TelegramWebhookOperationInput): {
  webhookUrl: string;
  allowedUpdates: string[];
  botTokenConfigured: true;
  webhookSecretConfigured: true;
};

export function configureTelegramMembershipWebhook(input: TelegramWebhookOperationInput): Promise<{
  webhookUrl: string;
  allowedUpdates: ["message"];
  verified: true;
}>;

export function deleteTelegramMembershipWebhook(input: TelegramWebhookDeleteInput): Promise<{
  webhookUrl: "";
  removed: true;
}>;
