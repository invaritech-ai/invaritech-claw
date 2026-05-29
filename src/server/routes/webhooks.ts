import type { Express } from "express";
import { isWebhookAuthError, type WebhookService } from "../../webhooks/service.js";
import type { Webhook } from "../../webhooks/types.js";

type PublicWebhook = Omit<Webhook, "config"> & {
  config: Omit<Webhook["config"], "secret">;
};

function parsePositiveLimit(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function toPublicWebhook(webhook: Webhook): PublicWebhook {
  const config: PublicWebhook["config"] = {};
  if (webhook.config.idempotencyHeader) {
    config.idempotencyHeader = webhook.config.idempotencyHeader;
  }
  return {
    ...webhook,
    config,
  };
}

export function attachWebhookRoutes(app: Express, webhookService: WebhookService): void {
  app.get("/webhooks", (req, res) => {
    res.json({
      webhooks: webhookService
        .listWebhooks(parsePositiveLimit(req.query.limit))
        .map(toPublicWebhook),
    });
  });

  app.post("/webhooks/:id", (req, res) => {
    const webhookId = String(req.params.id ?? "").trim();
    if (!webhookId) {
      res.status(400).json({ error: "webhook id is required" });
      return;
    }
    try {
      const result = webhookService.deliver({
        webhookId,
        headers: req.headers,
        body: req.body ?? {},
      });
      if (!result) {
        res.status(404).json({ error: "webhook not found" });
        return;
      }
      res.status(result.duplicate ? 200 : 202).json({
        runId: result.run.id,
        deliveryId: result.deliveryId,
        duplicate: result.duplicate,
      });
    } catch (error) {
      if (isWebhookAuthError(error)) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      throw error;
    }
  });
}
