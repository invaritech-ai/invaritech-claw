import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModelCompleteInput, ModelProvider } from "../../src/agent/types.js";
import type { IclawConfig } from "../../src/config/types.js";
import { createIclawApp, createIclawServices } from "../../src/server/app.js";
import { attachThreadRoutes } from "../../src/server/routes/threads.js";
import { openIclawDatabase } from "../../src/storage/sqlite.js";
import { createThreadService, type ThreadService } from "../../src/threads/service.js";

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

const TEST_CONFIG: IclawConfig = {
  agents: {},
  providers: {},
  server: { host: "127.0.0.1", port: 32768 },
  storage: {},
  models: {
    chat: "ollama/test-chat",
    memory: "ollama/test-memory",
    compaction: "ollama/test-compact",
    embedding: "ollama/test-embed",
    favorites: ["openrouter/test-favorite"],
    contextWindows: {},
  },
  context: {
    maxTokens: 32000,
    responseReservePercent: 15,
    memoryPercent: 15,
    summaryPercent: 20,
    recentMessagesPercent: 50,
  },
  compaction: { keepRecentMessages: 12 },
  memory: {},
  workers: { enabled: false, pollIntervalMs: 1000 },
};

type JsonRecord = Record<string, unknown>;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), 1000);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

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

function createFakeProvider(calls: ModelCompleteInput[]): ModelProvider {
  return {
    id: "ollama",
    async complete(input) {
      calls.push(input);
      if (input.model === "test-compact") {
        return { text: `compact summary for ${input.model}` };
      }
      return { text: `assistant saw: ${input.messages.at(-1)?.content ?? ""}` };
    },
    async *stream() {
      yield { type: "done" };
    },
    async listModels() {
      return [{ id: "test-chat", name: "Test Chat" }];
    },
  };
}

let tempDir = "";
let db: DatabaseSync;
let threadService: ThreadService;
let server: Server | undefined;
let baseUrl = "";
let listenBlocked = false;
let providerCalls: ModelCompleteInput[] = [];

async function startApp(app: express.Express): Promise<void> {
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
}

beforeEach(async () => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "iclaw-threads-api-test-"));
  const dbPath = path.join(tempDir, "state.sqlite");
  db = openIclawDatabase(dbPath);
  threadService = createThreadService({ db, config: TEST_CONFIG });
  providerCalls = [];

  const app = express();
  app.use(express.json());
  attachThreadRoutes(app, {
    config: TEST_CONFIG,
    providers: { ollama: createFakeProvider(providerCalls) },
    threadService,
  });
  await startApp(app);
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

describe("threads API routes", () => {
  it("creates and lists threads", async () => {
    if (listenBlocked) {
      return;
    }

    const created = await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Milestone A", objective: "Replace runs" }),
      });
      expect(response.status).toBe(201);
      return (await response.json()) as JsonRecord;
    });

    expect(created.title).toBe("Milestone A");
    expect(created.objective).toBe("Replace runs");
    expect(created.activeModelRef).toBe("ollama/test-chat");

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { threads: JsonRecord[] };
      expect(payload.threads.map((thread) => thread.id)).toEqual([created.id]);
    });
  });

  it("rejects invalid create modelRef without creating a thread", async () => {
    if (listenBlocked) {
      return;
    }

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Bad model", modelRef: "not-a-model-ref" }),
      });
      expect(response.status).toBe(400);
      const payload = (await response.json()) as JsonRecord;
      expect(payload.error).toBe("invalid modelRef");
      expect(payload.message).toBe("invalid model reference: not-a-model-ref");
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { threads: JsonRecord[] };
      expect(payload.threads).toEqual([]);
    });
  });

  it("rejects an unconfigured default create modelRef without creating a thread", async () => {
    if (listenBlocked) {
      return;
    }

    const noProviderConfig: IclawConfig = {
      ...TEST_CONFIG,
      models: { ...TEST_CONFIG.models, chat: "ollama/missing-default" },
    };
    const noProviderThreadService = createThreadService({ db, config: noProviderConfig });
    const app = express();
    app.use(express.json());
    attachThreadRoutes(app, {
      config: noProviderConfig,
      providers: {},
      threadService: noProviderThreadService,
    });

    await new Promise<void>((resolve) => server?.close(() => resolve()));
    await startApp(app);

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Missing default" }),
      });
      expect(response.status).toBe(400);
      const payload = (await response.json()) as JsonRecord;
      expect(payload.error).toBe("invalid modelRef");
      expect(payload.message).toBe("provider is not configured: ollama");
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { threads: JsonRecord[] };
      expect(payload.threads).toEqual([]);
    });
  });

  it("creates a thread with a configured modelRef override", async () => {
    if (listenBlocked) {
      return;
    }

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Configured model", modelRef: "ollama/alternate-chat" }),
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as JsonRecord;
      expect(payload.activeModelRef).toBe("ollama/alternate-chat");
    });
  });

  it("posts a user message and returns an assistant response", async () => {
    if (listenBlocked) {
      return;
    }

    const thread = threadService.createThread({ title: "Chat" });

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "What replaces runs?" }),
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        message: JsonRecord;
        context: { tokenEstimate: number; usedMemories: JsonRecord[] };
      };
      expect(payload.message.role).toBe("assistant");
      expect(payload.message.contentText).toBe("assistant saw: What replaces runs?");
      expect(payload.context.tokenEstimate).toBeGreaterThan(0);
      expect(payload.context.usedMemories).toEqual([]);
    });

    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]?.model).toBe("test-chat");
    expect(providerCalls[0]?.messages.map((message) => message.role)).toEqual(["system", "user"]);

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/messages`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { messages: JsonRecord[] };
      expect(payload.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    });
  });

  it("rejects a concurrent message request for the same thread", async () => {
    if (listenBlocked) {
      return;
    }

    const firstProviderResult = createDeferred<{ text: string }>();
    const providerCalled = createDeferred<void>();
    const calls: ModelCompleteInput[] = [];
    const app = express();
    app.use(express.json());
    attachThreadRoutes(app, {
      config: TEST_CONFIG,
      providers: {
        ollama: {
          id: "ollama",
          async complete(input) {
            calls.push(input);
            providerCalled.resolve();
            return firstProviderResult.promise;
          },
          async *stream() {
            yield { type: "done" };
          },
          async listModels() {
            return [{ id: "test-chat", name: "Test Chat" }];
          },
        },
      },
      threadService,
    });

    await new Promise<void>((resolve) => server?.close(() => resolve()));
    await startApp(app);

    const thread = threadService.createThread({ title: "Concurrent Chat" });

    const firstResponsePromise: Promise<Response> = withLoopbackEnv(async () =>
      fetch(`${baseUrl}/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "First" }),
      }),
    );

    try {
      await withTimeout(providerCalled.promise, "provider was not called for the first request");

      await withLoopbackEnv(async () => {
        const response = await fetch(`${baseUrl}/threads/${thread.id}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: "Second" }),
        });
        expect(response.status).toBe(409);
        const payload = (await response.json()) as JsonRecord;
        expect(payload.error).toBe("thread message request already in progress");
      });

      firstProviderResult.resolve({ text: "First response" });
      const firstResponse = await withTimeout(
        firstResponsePromise,
        "first message request did not finish after provider resolution",
      );
      expect(firstResponse.status).toBe(201);
      const firstPayload = (await firstResponse.json()) as { message: JsonRecord };
      expect(firstPayload.message.contentText).toBe("First response");
    } finally {
      firstProviderResult.resolve({ text: "Cleanup response" });
      await firstResponsePromise.catch(() => undefined);
    }

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "Third" }),
      });
      expect(response.status).toBe(201);
    });

    expect(calls).toHaveLength(2);
  });

  it("compacts a thread using the configured compaction model", async () => {
    if (listenBlocked) {
      return;
    }

    const thread = threadService.createThread({
      title: "Compact",
      objective: "Ship thread compaction.",
    });
    threadService.appendUserMessage(thread.id, "Implement the compact endpoint.");
    const latestMessage = threadService.appendUserMessage(thread.id, "Persist the summary.");

    const compacted = await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/compact`, {
        method: "POST",
      });
      expect(response.status).toBe(201);
      return (await response.json()) as { summary: JsonRecord; invocationId: string };
    });

    expect(compacted.invocationId).toEqual(expect.any(String));
    expect(compacted.summary.summaryText).toBe("compact summary for test-compact");
    expect(compacted.summary.coveredThroughMessageId).toBe(latestMessage.id);
    expect(compacted.summary.sourceSummaryId).toBeNull();

    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]?.model).toBe("test-compact");
    expect(providerCalls[0]?.messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(providerCalls[0]?.messages.at(-1)?.content).toContain("Ship thread compaction.");
    expect(providerCalls[0]?.messages.at(-1)?.content).toContain("Persist the summary.");

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/summary`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { summary: JsonRecord };
      expect(payload.summary.id).toBe(compacted.summary.id);
    });
  });

  it("persists model override per thread", async () => {
    if (listenBlocked) {
      return;
    }

    const thread = threadService.createThread({ title: "Model switch" });

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/model`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelRef: "ollama/alternate-chat" }),
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as JsonRecord;
      expect(payload.activeModelRef).toBe("ollama/alternate-chat");
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as JsonRecord;
      expect(payload.activeModelRef).toBe("ollama/alternate-chat");
    });
  });

  it("rejects invalid model update without changing the active modelRef", async () => {
    if (listenBlocked) {
      return;
    }

    const thread = threadService.createThread({
      title: "Model stays put",
      modelRef: "ollama/original-chat",
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/model`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelRef: "openrouter/not-configured" }),
      });
      expect(response.status).toBe(400);
      const payload = (await response.json()) as JsonRecord;
      expect(payload.error).toBe("invalid modelRef");
      expect(payload.message).toBe("provider is not configured: openrouter");
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as JsonRecord;
      expect(payload.activeModelRef).toBe("ollama/original-chat");
    });
  });

  it("creates, searches, and forgets memories", async () => {
    if (listenBlocked) {
      return;
    }

    const thread = threadService.createThread({ title: "Memory" });
    const memory = await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/memories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "decision",
          content: "Threads replace runs.",
          tags: ["milestone-a"],
          importance: 0.9,
        }),
      });
      expect(response.status).toBe(201);
      return (await response.json()) as JsonRecord;
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/memories?query=replace+runs`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { memories: JsonRecord[] };
      expect(payload.memories.map((item) => item.id)).toEqual([memory.id]);
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(
        `${baseUrl}/threads/${thread.id}/memories/${String(memory.id).slice(0, 8)}/forget`,
        { method: "POST" },
      );
      expect(response.status).toBe(200);
      const forgotten = (await response.json()) as JsonRecord;
      expect(forgotten.status).toBe("forgotten");
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/memories?query=replace+runs`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { memories: JsonRecord[] };
      expect(payload.memories).toEqual([]);
    });
  });

  it("returns 404 when creating memory through a missing thread", async () => {
    if (listenBlocked) {
      return;
    }

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/missing/memories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "global",
          content: "Do not create this global memory.",
        }),
      });
      expect(response.status).toBe(404);
      const payload = (await response.json()) as JsonRecord;
      expect(payload).toEqual({ error: "thread not found" });
    });
  });

  it("returns 404 when searching memories through a missing thread", async () => {
    if (listenBlocked) {
      return;
    }

    const thread = threadService.createThread({ title: "Existing memory owner" });
    threadService.remember({
      scope: "global",
      threadId: null,
      content: "Global memory should require a valid route thread to search.",
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/missing/memories?query=valid+route+thread`);
      expect(response.status).toBe(404);
      const payload = (await response.json()) as JsonRecord;
      expect(payload).toEqual({ error: "thread not found" });
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(
        `${baseUrl}/threads/${thread.id}/memories?query=valid+route+thread`,
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { memories: JsonRecord[] };
      expect(payload.memories).toHaveLength(1);
    });
  });

  it("returns 404 and preserves memory when forgetting through a missing thread", async () => {
    if (listenBlocked) {
      return;
    }

    const thread = threadService.createThread({ title: "Global memory owner" });
    const memory = await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/memories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "global",
          content: "Global memory remains active after missing thread forget.",
        }),
      });
      expect(response.status).toBe(201);
      return (await response.json()) as JsonRecord;
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(
        `${baseUrl}/threads/missing/memories/${String(memory.id).slice(0, 8)}/forget`,
        { method: "POST" },
      );
      expect(response.status).toBe(404);
      const payload = (await response.json()) as JsonRecord;
      expect(payload).toEqual({ error: "thread not found" });
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/memories?query=remains+active`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { memories: JsonRecord[] };
      expect(payload.memories.map((item) => item.id)).toEqual([memory.id]);
      expect(payload.memories[0]?.status).toBe("active");
    });
  });

  it("returns context preview and memories used for the latest response", async () => {
    if (listenBlocked) {
      return;
    }

    const thread = threadService.createThread({
      title: "Context",
      objective: "Migrate API from runs to threads.",
    });
    const memory = threadService.remember({
      scope: "thread",
      threadId: thread.id,
      type: "decision",
      content: "Threads replace runs.",
      tags: ["api"],
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "What replaces runs?" }),
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as { context: { usedMemories: JsonRecord[] } };
      expect(payload.context.usedMemories.map((item) => item.id)).toEqual([memory.id]);
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/context`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        context: { sections: { objective: string; memories: string } };
      };
      expect(payload.context.sections.objective).toBe("Migrate API from runs to threads.");
      expect(payload.context.sections.memories).toContain("Threads replace runs.");
    });

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/threads/${thread.id}/memory-used`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { memories: JsonRecord[] };
      expect(payload.memories.map((item) => item.id)).toEqual([memory.id]);
    });
  });

  it("lists configured models", async () => {
    if (listenBlocked) {
      return;
    }

    await withLoopbackEnv(async () => {
      const response = await fetch(`${baseUrl}/models`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { models: JsonRecord[] };
      expect(payload.models.map((model) => model.id)).toEqual([
        "ollama/test-chat",
        "openrouter/test-favorite",
      ]);
    });
  });

  it("does not expose /runs once integrated", async () => {
    if (listenBlocked) {
      return;
    }

    const services = createIclawServices({
      dbPath: path.join(tempDir, "integrated.sqlite"),
      config: TEST_CONFIG,
    });
    services.providers.ollama = createFakeProvider([]);
    const integratedApp = createIclawApp({ services });

    await new Promise<void>((resolve) => server?.close(() => resolve()));
    try {
      await startApp(integratedApp);

      await withLoopbackEnv(async () => {
        const response = await fetch(`${baseUrl}/runs?agentId=main`);
        expect(response.status).toBe(404);
      });
    } finally {
      services.db.close();
    }
  });
});
