import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRunService, type RunService } from "../../src/runs/service.js";
import { attachRunRoutes } from "../../src/server/routes/runs.js";
import { openIclawDatabase } from "../../src/storage/sqlite.js";

const LOOPBACK_FETCH_ENV = {
  HTTP_PROXY: undefined,
  HTTPS_PROXY: undefined,
  ALL_PROXY: undefined,
  http_proxy: undefined,
  https_proxy: undefined,
  all_proxy: undefined,
  NO_PROXY: "127.0.0.1,localhost",
  no_proxy: "127.0.0.1,localhost",
} as const;

function isListenPermissionError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error.code === "EPERM" || error.code === "EACCES")
  );
}

async function withLoopbackEnv<T>(run: () => Promise<T>): Promise<T> {
  const keys = Object.keys(LOOPBACK_FETCH_ENV);
  const snapshot = new Map<string, string | undefined>();
  for (const key of keys) {
    snapshot.set(key, process.env[key]);
  }

  try {
    for (const [key, value] of Object.entries(LOOPBACK_FETCH_ENV)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return await run();
  } finally {
    for (const [key, value] of snapshot) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

let tempDir = "";
let db: DatabaseSync;
let runService: RunService;
let server: Server | undefined;
let baseUrl = "";
let listenBlocked = false;

beforeEach(async () => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "iclaw-runs-api-test-"));
  const dbPath = path.join(tempDir, "state.sqlite");
  db = openIclawDatabase(dbPath);
  runService = createRunService(db);

  const app = express();
  app.use(express.json());
  attachRunRoutes(app, runService);

  try {
    server = await new Promise<Server>((resolve, reject) => {
      const nextServer = app.listen(0, "127.0.0.1");
      nextServer.once("listening", () => resolve(nextServer));
      nextServer.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    listenBlocked = false;
  } catch (error) {
    if (!isListenPermissionError(error)) {
      throw error;
    }
    listenBlocked = true;
    baseUrl = "http://127.0.0.1:0";
    server = undefined;
  }
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
  server = undefined;
  baseUrl = "";
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("runs API routes", () => {
  it("supports create, list, fetch, events, and cancel routes", async () => {
    if (listenBlocked) {
      return;
    }

    const createdRunId = await withLoopbackEnv(async () => {
      const createResponse = await fetch(`${baseUrl}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: "main",
          triggerType: "api",
          input: { text: "hello" },
        }),
      });
      expect(createResponse.status).toBe(201);
      const createdRun = (await createResponse.json()) as { id: string; status: string };
      expect(createdRun.status).toBe("queued");
      return createdRun.id;
    });

    await withLoopbackEnv(async () => {
      const listResponse = await fetch(`${baseUrl}/runs?agentId=main`);
      expect(listResponse.status).toBe(200);
      const listPayload = (await listResponse.json()) as { runs: Array<{ id: string }> };
      expect(listPayload.runs).toHaveLength(1);
      expect(listPayload.runs[0]?.id).toBe(createdRunId);
    });

    await withLoopbackEnv(async () => {
      const getResponse = await fetch(`${baseUrl}/runs/${createdRunId}`);
      expect(getResponse.status).toBe(200);
      const run = (await getResponse.json()) as { id: string };
      expect(run.id).toBe(createdRunId);
    });

    runService.appendEvent(createdRunId, {
      type: "run.queued",
      payload: { status: "queued" },
    });

    await withLoopbackEnv(async () => {
      const eventsResponse = await fetch(`${baseUrl}/runs/${createdRunId}/events`);
      expect(eventsResponse.status).toBe(200);
      const eventsPayload = (await eventsResponse.json()) as { events: Array<{ type: string }> };
      expect(eventsPayload.events).toHaveLength(1);
      expect(eventsPayload.events[0]?.type).toBe("run.queued");
    });

    await withLoopbackEnv(async () => {
      const cancelResponse = await fetch(`${baseUrl}/runs/${createdRunId}/cancel`, {
        method: "POST",
      });
      expect(cancelResponse.status).toBe(200);
      const cancelledRun = (await cancelResponse.json()) as { status: string };
      expect(cancelledRun.status).toBe("cancelled");
    });
  });

  it("returns deterministic 409 for duplicate create conflicts", async () => {
    if (listenBlocked) {
      return;
    }

    await withLoopbackEnv(async () => {
      const first = await fetch(`${baseUrl}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: "main",
          triggerType: "api",
          triggerId: "req-1",
          idempotencyKey: "idem-1",
          input: { text: "hello" },
        }),
      });
      expect(first.status).toBe(201);
    });

    await withLoopbackEnv(async () => {
      const second = await fetch(`${baseUrl}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: "main",
          triggerType: "api",
          triggerId: "req-1",
          idempotencyKey: "idem-1",
          input: { text: "hello again" },
        }),
      });
      expect(second.status).toBe(409);
      const payload = (await second.json()) as {
        error: { code: string; reason: string; message: string };
      };
      expect(payload.error.code).toBe("run_conflict");
      expect(payload.error.reason).toBe("duplicate_idempotency");
      expect(payload.error.message).toBe("run idempotency key already exists");
    });
  });
});
