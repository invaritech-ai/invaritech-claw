import type { Run } from "../runs/types.js";

export type WebhookConfig = {
  secret?: string;
  idempotencyHeader?: string;
};

export type Webhook = {
  id: string;
  path: string;
  agentId: string;
  config: WebhookConfig;
  createdAtMs: number;
  updatedAtMs: number;
};

export type WebhookDeliveryRequest = {
  webhookId: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  nowMs?: number;
};

export type WebhookDeliveryResult = {
  webhook: Webhook;
  run: Run;
  deliveryId: string;
  duplicate: boolean;
};
