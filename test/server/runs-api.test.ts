import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModelProvider } from "../../src/agent/types.js";
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

  it("executes runs when requested", async () => {
    if (listenBlocked) {
      return;
    }

    const provider: ModelProvider = {
      id: "ollama",
      async *stream() {
        yield { type: "output_text_delta", text: "hello" };
        yield { type: "output_text_delta", text: " there" };
        yield { type: "done" };
      },
    };

    const executableApp = express();
    executableApp.use(express.json());
    attachRunRoutes(executableApp, runService, {
      agents: {
        main: {
          model: "ollama/llama3.2",
          system: "Be direct.",
        },
      },
      providers: { ollama: provider },
    });

    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = await new Promise<Server>((resolve, reject) => {
      const nextServer = executableApp.listen(0, "127.0.0.1");
      nextServer.once("listening", () => resolve(nextServer));
      nextServer.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: "main",
          triggerType: "api",
          input: { text: "hello from test" },
          execute: true,
        }),
      });
      expect(response.status).toBe(201);
      const run = (await response.json()) as { id: string; status: string; result: unknown };
      expect(run.status).toBe("succeeded");
      expect(run.result).toEqual({ outputText: "hello there" });

      const events = runService.listEvents(run.id);
      expect(events.map((event) => event.type)).toEqual([
        "run.started",
        "model.output.delta",
        "model.output.delta",
        "run.succeeded",
      ]);
    });
  });

  it("returns 400 for executable runs with unknown agents", async () => {
    if (listenBlocked) {
      return;
    }

    const executableApp = express();
    executableApp.use(express.json());
    attachRunRoutes(executableApp, runService, {
      agents: {},
      providers: {},
    });

    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = await new Promise<Server>((resolve, reject) => {
      const nextServer = executableApp.listen(0, "127.0.0.1");
      nextServer.once("listening", () => resolve(nextServer));
      nextServer.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: "missing",
          triggerType: "api",
          input: { text: "hello" },
          execute: true,
        }),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "unknown agent: missing" });
    });
  });

  it("records a clear failure when the configured provider is missing", async () => {
    if (listenBlocked) {
      return;
    }

    const executableApp = express();
    executableApp.use(express.json());
    attachRunRoutes(executableApp, runService, {
      agents: {
        main: {
          model: "ollama/llama3.2",
        },
      },
      providers: {},
    });

    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = await new Promise<Server>((resolve, reject) => {
      const nextServer = executableApp.listen(0, "127.0.0.1");
      nextServer.once("listening", () => resolve(nextServer));
      nextServer.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: "main",
          triggerType: "api",
          input: { text: "hello" },
          execute: true,
        }),
      });
      expect(response.status).toBe(201);
      const run = (await response.json()) as { status: string; error: { message: string } };
      expect(run.status).toBe("failed");
      expect(run.error.message).toBe("provider is not configured: ollama");
    });
  });
});
