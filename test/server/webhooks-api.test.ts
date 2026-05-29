import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import express from "express";
import { describe, expect, it } from "vitest";
import { createRunService } from "../../src/runs/service.js";
import { attachWebhookRoutes } from "../../src/server/routes/webhooks.js";
import { openIclawDatabase } from "../../src/storage/sqlite.js";
import { createWebhookService } from "../../src/webhooks/service.js";

async function startServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "iclaw-webhooks-api-"));
  const db = openIclawDatabase(path.join(dir, "state.sqlite"));
  const runService = createRunService(db);
  const webhooks = createWebhookService({ db, runService });
  webhooks.registerWebhook({
    id: "ingest",
    agentId: "main",
    config: {
      secret: "secret-1",
      idempotencyHeader: "x-event-id",
    },
  });
  const app = express();
  app.use(express.json());
  attachWebhookRoutes(app, webhooks);
  const server = await new Promise<Server>((resolve, reject) => {
    const srv = app.listen(0, "127.0.0.1");
    srv.once("listening", () => resolve(srv));
    srv.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("webhook API", () => {
  it("returns 401 for missing/wrong secret and creates runs for valid secret", async () => {
    const server = await startServer();
    try {
      const missing = await fetch(`${server.baseUrl}/webhooks/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "hello" }),
      });
      expect(missing.status).toBe(401);

      const wrong = await fetch(`${server.baseUrl}/webhooks/ingest`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-iclaw-webhook-secret": "wrong",
        },
        body: JSON.stringify({ text: "hello" }),
      });
      expect(wrong.status).toBe(401);

      const valid = await fetch(`${server.baseUrl}/webhooks/ingest`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-iclaw-webhook-secret": "secret-1",
        },
        body: JSON.stringify({ text: "hello" }),
      });
      expect(valid.status).toBe(202);
      const body = (await valid.json()) as { runId?: string; duplicate: boolean };
      expect(body.runId).toBeTruthy();
      expect(body.duplicate).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("returns existing run for duplicate idempotency keys and lists webhooks", async () => {
    const server = await startServer();
    try {
      const first = await fetch(`${server.baseUrl}/webhooks/ingest`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-iclaw-webhook-secret": "secret-1",
          "x-event-id": "evt-1",
        },
        body: JSON.stringify({ text: "first" }),
      });
      expect(first.status).toBe(202);
      const firstBody = (await first.json()) as { runId: string };

      const second = await fetch(`${server.baseUrl}/webhooks/ingest`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-iclaw-webhook-secret": "secret-1",
          "x-event-id": "evt-1",
        },
        body: JSON.stringify({ text: "second" }),
      });
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as { runId: string; duplicate: boolean };
      expect(secondBody).toMatchObject({ runId: firstBody.runId, duplicate: true });

      const list = await fetch(`${server.baseUrl}/webhooks`);
      expect(list.status).toBe(200);
      const listBody = (await list.json()) as {
        webhooks: Array<{ id: string; config?: { secret?: string; idempotencyHeader?: string } }>;
      };
      expect(listBody.webhooks.map((webhook) => webhook.id)).toContain("ingest");
      const listedWebhook = listBody.webhooks.find((webhook) => webhook.id === "ingest");
      expect(listedWebhook?.config).toMatchObject({ idempotencyHeader: "x-event-id" });
      expect(listedWebhook?.config?.secret).toBeUndefined();
    } finally {
      await server.close();
    }
  });
});
