import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRunService } from "../../src/runs/service.js";
import { openIclawDatabase } from "../../src/storage/sqlite.js";
import { getWebhookDeliveryById } from "../../src/storage/webhooks.js";
import { createWebhookService, WebhookAuthError } from "../../src/webhooks/service.js";

describe("webhook service", () => {
  it("rejects missing or wrong secrets and creates a run with a valid secret", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "iclaw-webhook-auth-"));
    const db = openIclawDatabase(path.join(dir, "state.sqlite"));
    try {
      const runService = createRunService(db);
      const webhooks = createWebhookService({ db, runService });
      webhooks.registerWebhook({
        id: "ingest",
        agentId: "main",
        config: { secret: "secret-1" },
      });
      webhooks.registerWebhook({
        id: "unsealed",
        agentId: "main",
      });

      expect(() =>
        webhooks.deliver({
          webhookId: "ingest",
          headers: {},
          body: { text: "hello" },
        }),
      ).toThrow(WebhookAuthError);
      expect(() =>
        webhooks.deliver({
          webhookId: "unsealed",
          headers: {},
          body: { text: "hello" },
        }),
      ).toThrow(WebhookAuthError);
      expect(() =>
        webhooks.deliver({
          webhookId: "ingest",
          headers: { "x-iclaw-webhook-secret": "wrong" },
          body: { text: "hello" },
        }),
      ).toThrow(WebhookAuthError);

      const result = webhooks.deliver({
        webhookId: "ingest",
        headers: { "x-iclaw-webhook-secret": "secret-1" },
        body: { text: "hello" },
      });
      expect(result?.duplicate).toBe(false);
      expect(result?.run.status).toBe("queued");
      expect(result?.run.triggerType).toBe("webhook");
      expect(result?.run.triggerId).toBe("ingest");

      const delivery = result ? getWebhookDeliveryById(db, result.deliveryId) : undefined;
      const requestMetadata = JSON.parse(delivery?.requestJson ?? "{}") as {
        headers?: Record<string, string>;
      };
      expect(requestMetadata.headers?.["x-iclaw-webhook-secret"]).toBe("[redacted]");
      expect(delivery?.responseJson).toContain(result?.run.id);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns the existing run for duplicate idempotency keys", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "iclaw-webhook-idempotency-"));
    const db = openIclawDatabase(path.join(dir, "state.sqlite"));
    try {
      const runService = createRunService(db);
      const webhooks = createWebhookService({ db, runService });
      webhooks.registerWebhook({
        id: "ingest",
        agentId: "main",
        config: { secret: "secret-1", idempotencyHeader: "x-event-id" },
      });

      const first = webhooks.deliver({
        webhookId: "ingest",
        headers: { "x-iclaw-webhook-secret": "secret-1", "x-event-id": "evt-1" },
        body: { text: "first" },
      });
      const second = webhooks.deliver({
        webhookId: "ingest",
        headers: { "x-iclaw-webhook-secret": "secret-1", "x-event-id": "evt-1" },
        body: { text: "second" },
      });

      expect(first?.run.id).toBeDefined();
      expect(second?.duplicate).toBe(true);
      expect(second?.run.id).toBe(first?.run.id);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns an existing idempotent run even when delivery metadata is missing", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "iclaw-webhook-idempotent-run-"));
    const db = openIclawDatabase(path.join(dir, "state.sqlite"));
    try {
      const runService = createRunService(db);
      const webhooks = createWebhookService({ db, runService });
      webhooks.registerWebhook({
        id: "ingest",
        agentId: "main",
        config: { secret: "secret-1", idempotencyHeader: "x-event-id" },
      });
      const existingRun = runService.createRun({
        agentId: "main",
        triggerType: "webhook",
        triggerId: "ingest",
        idempotencyKey: "evt-1",
        input: { seeded: true },
      });

      const result = webhooks.deliver({
        webhookId: "ingest",
        headers: { "x-iclaw-webhook-secret": "secret-1", "x-event-id": "evt-1" },
        body: { text: "second" },
      });

      expect(result?.duplicate).toBe(true);
      expect(result?.run.id).toBe(existingRun.id);
      const delivery = result ? getWebhookDeliveryById(db, result.deliveryId) : undefined;
      expect(delivery?.runId).toBe(existingRun.id);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
