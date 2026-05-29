import type { Webhook } from "../../webhooks/types.js";

export type WebhooksView = {
  title: "Webhooks";
  rows: Array<{
    id: string;
    path: string;
    agentId: string;
    idempotencyHeader: string | null;
  }>;
};

export function buildWebhooksView(webhooks: Webhook[]): WebhooksView {
  return {
    title: "Webhooks",
    rows: webhooks.map((webhook) => ({
      id: webhook.id,
      path: webhook.path,
      agentId: webhook.agentId,
      idempotencyHeader: webhook.config.idempotencyHeader ?? null,
    })),
  };
}
