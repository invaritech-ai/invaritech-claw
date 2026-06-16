import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModelCompleteInput, ModelProvider } from "../../src/agent/types.js";
import type { IclawConfig } from "../../src/config/types.js";
import { openIclawDatabase } from "../../src/storage/sqlite.js";
import { buildCompactionPrompt, compactThread } from "../../src/threads/compact.js";
import { createThreadService, type ThreadService } from "../../src/threads/service.js";

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
    favorites: [],
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

type InvocationRow = {
  kind: string;
  status: string;
  model_ref: string;
  error_json: string | null;
};

let tempDir = "";
let db: DatabaseSync;
let service: ThreadService;
let providerCalls: ModelCompleteInput[] = [];

function createProvider(input: { text?: string; error?: Error } = {}): ModelProvider {
  return {
    id: "ollama",
    async complete(call) {
      providerCalls.push(call);
      if (input.error) {
        throw input.error;
      }
      return { text: input.text ?? "compacted summary" };
    },
    async *stream() {
      yield { type: "done" };
    },
  };
}

function listInvocationRows(): InvocationRow[] {
  return db
    .prepare(
      "SELECT kind, status, model_ref, error_json FROM model_invocations ORDER BY created_at_ms ASC",
    )
    .all() as InvocationRow[];
}

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "iclaw-compact-test-"));
  db = openIclawDatabase(path.join(tempDir, "state.sqlite"));
  service = createThreadService({ db, config: TEST_CONFIG });
  providerCalls = [];
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("thread compaction", () => {
  it("builds compaction prompt with previous summary and uncovered messages", () => {
    const prompt = buildCompactionPrompt({
      objective: "Ship Task 6 without changing TUI contracts.",
      previousSummary: "Decision: use summary id summary-7 exactly.",
      messages: [
        {
          role: "user",
          contentText: "Open question: should coveredThroughMessageId be message-3?",
        },
        {
          role: "assistant",
          contentText: "Current status: route still owns provider orchestration.",
        },
      ],
    });

    expect(prompt).toContain(
      "Preserve objective, decisions, constraints, open questions, current status, and identifiers exactly.",
    );
    expect(prompt).toContain("Objective:\nShip Task 6 without changing TUI contracts.");
    expect(prompt).toContain("Previous summary:\nDecision: use summary id summary-7 exactly.");
    expect(prompt).toContain("user: Open question: should coveredThroughMessageId be message-3?");
    expect(prompt).toContain("assistant: Current status: route still owns provider orchestration.");
  });

  it("keeps the last 12 messages raw by default", async () => {
    const thread = service.createThread({ title: "Keep window" });
    const messages = Array.from({ length: 13 }, (_item, index) =>
      service.appendUserMessage(thread.id, `message ${index + 1}`),
    );

    const result = await compactThread({
      threadId: thread.id,
      config: TEST_CONFIG,
      providers: { ollama: createProvider() },
      service,
    });

    expect(result.summary.coveredThroughMessageId).toBe(messages[0]?.id);
    expect(providerCalls).toHaveLength(1);
    const prompt = providerCalls[0]?.messages.at(-1)?.content ?? "";
    expect(prompt).toContain("user: message 1");
    for (const rawMessage of messages.slice(1)) {
      expect(prompt).not.toContain(`user: ${rawMessage.contentText}`);
    }
  });

  it("keeps the true latest messages raw when the thread has more than 1000 messages", async () => {
    const thread = service.createThread({ title: "Large keep window" });
    const messages = Array.from({ length: 1005 }, (_item, index) =>
      service.appendUserMessage(thread.id, `window message ${String(index + 1).padStart(4, "0")}`),
    );

    const result = await compactThread({
      threadId: thread.id,
      config: TEST_CONFIG,
      providers: { ollama: createProvider() },
      service,
    });

    expect(result.summary.coveredThroughMessageId).toBe(messages[992]?.id);
    expect(providerCalls).toHaveLength(1);
    const prompt = providerCalls[0]?.messages.at(-1)?.content ?? "";
    expect(prompt).toContain("user: window message 0993");
    expect(prompt).not.toContain("user: window message 0994");
    expect(prompt).not.toContain("user: window message 1005");
  });

  it("stores a new summary with coveredThroughMessageId", async () => {
    const thread = service.createThread({ title: "Store summary" });
    const messages = Array.from({ length: 4 }, (_item, index) =>
      service.appendUserMessage(thread.id, `store message ${index + 1}`),
    );
    const previousSummary = service.storeSummary({
      threadId: thread.id,
      summaryText: "Earlier summary.",
      coveredThroughMessageId: messages[0]?.id,
    });

    const result = await compactThread({
      threadId: thread.id,
      config: { ...TEST_CONFIG, compaction: { keepRecentMessages: 2 } },
      providers: { ollama: createProvider({ text: "New compacted summary." }) },
      service,
    });

    expect(result.summary.summaryText).toBe("New compacted summary.");
    expect(result.summary.coveredThroughMessageId).toBe(messages[1]?.id);
    expect(result.summary.sourceSummaryId).toBe(previousSummary.id);
    expect(service.getLatestSummary(thread.id)).toEqual(result.summary);
    const prompt = providerCalls[0]?.messages.at(-1)?.content ?? "";
    expect(prompt).not.toContain("user: store message 1");
    expect(prompt).toContain("user: store message 2");
    expect(prompt).not.toContain("user: store message 3");
    expect(prompt).not.toContain("user: store message 4");
    expect(result.invocationId).toEqual(expect.any(String));
    expect(listInvocationRows()).toEqual([
      {
        kind: "compaction",
        status: "succeeded",
        model_ref: "ollama/test-compact",
        error_json: null,
      },
    ]);
  });

  it("does not compact when provider complete fails", async () => {
    const thread = service.createThread({ title: "Provider failure" });
    const previousSummary = service.storeSummary({
      threadId: thread.id,
      summaryText: "Keep this summary.",
      coveredThroughMessageId: null,
    });
    service.appendUserMessage(thread.id, "message before failure");

    await expect(
      compactThread({
        threadId: thread.id,
        config: TEST_CONFIG,
        providers: { ollama: createProvider({ error: new Error("provider unavailable") }) },
        service,
      }),
    ).rejects.toThrow("provider unavailable");

    expect(service.getLatestSummary(thread.id)).toEqual(previousSummary);
    expect(listInvocationRows()).toEqual([
      {
        kind: "compaction",
        status: "failed",
        model_ref: "ollama/test-compact",
        error_json: JSON.stringify({ message: "provider unavailable" }),
      },
    ]);
  });
});
