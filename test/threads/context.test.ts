import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { IclawConfig } from "../../src/config/types.js";
import { openIclawDatabase } from "../../src/storage/sqlite.js";
import { insertMemory } from "../../src/storage/threads.js";
import { buildThreadContext } from "../../src/threads/context.js";
import { AmbiguousMemoryIdError, createThreadService } from "../../src/threads/service.js";

const BASE_CONFIG: IclawConfig = {
  agents: {},
  providers: {},
  server: { host: "127.0.0.1", port: 32768 },
  storage: {},
  models: {
    chat: "ollama/gemma4:e4b",
    memory: "ollama/qwen3:4b",
    compaction: "ollama/gemma4:e4b",
    embedding: "ollama/mxbai-embed-large:latest",
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
  workers: { enabled: true, pollIntervalMs: 1000 },
};

function withService(
  run: (input: { db: DatabaseSync; service: ReturnType<typeof createThreadService> }) => void,
): void {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "iclaw-context-test-"));
  const dbPath = path.join(tempDir, "state.sqlite");
  const db = openIclawDatabase(dbPath);
  const service = createThreadService({ db, config: BASE_CONFIG });

  try {
    run({ db, service });
  } finally {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe("thread service and context reconstruction", () => {
  it("creates a default main thread with configured chat model", () => {
    withService(({ service }) => {
      const thread = service.getOrCreateDefaultThread();

      expect(thread.title).toBe("main");
      expect(thread.activeModelRef).toBe("ollama/gemma4:e4b");
      expect(service.listThreads({ limit: 10 }).map((item) => item.id)).toEqual([thread.id]);
    });
  });

  it("persists user messages before assistant messages", () => {
    withService(({ service }) => {
      const thread = service.getOrCreateDefaultThread();
      const user = service.appendUserMessage(thread.id, "Remember the provider choice.");
      const assistant = service.appendAssistantMessage(thread.id, {
        content: "I will keep that in mind.",
        modelRef: thread.activeModelRef,
        status: "complete",
      });

      expect(service.listMessages(thread.id).map((message) => message.id)).toEqual([
        user.id,
        assistant.id,
      ]);
      expect(user.role).toBe("user");
      expect(assistant.role).toBe("assistant");
    });
  });

  it("retrieves thread and global memories for the current prompt", () => {
    withService(({ service }) => {
      const thread = service.getOrCreateDefaultThread();
      const otherThread = service.createThread({ title: "other" });
      service.remember({
        scope: "thread",
        threadId: thread.id,
        type: "decision",
        content: "Use Gemma for chat responses.",
        tags: ["models"],
      });
      service.remember({
        scope: "global",
        type: "preference",
        content: "Prefer manual model switching.",
        tags: ["models"],
      });
      service.remember({
        scope: "thread",
        threadId: otherThread.id,
        type: "decision",
        content: "Other thread model decision.",
        tags: ["models"],
      });

      const memories = service.searchMemories({
        scope: "thread_and_global",
        threadId: thread.id,
        query: "model switching Gemma",
        limit: 10,
      });

      expect(new Set(memories.map((memory) => memory.contentText))).toEqual(
        new Set(["Use Gemma for chat responses.", "Prefer manual model switching."]),
      );
    });
  });

  it("forgets active memories by id prefix without using memory text search", () => {
    withService(({ service }) => {
      const thread = service.getOrCreateDefaultThread();
      const memory = service.remember({
        scope: "thread",
        threadId: thread.id,
        type: "decision",
        content: "This content deliberately does not include its identifier.",
        tags: ["forget"],
      });

      const forgotten = service.forgetMemory(memory.id.slice(0, 8), thread.id);

      expect(forgotten.id).toBe(memory.id);
      expect(forgotten.status).toBe("forgotten");
      expect(
        service.searchMemories({
          scope: "thread",
          threadId: thread.id,
          query: "identifier",
          limit: 10,
        }),
      ).toEqual([]);
    });
  });

  it("rejects ambiguous memory id prefixes", () => {
    withService(({ db, service }) => {
      const thread = service.getOrCreateDefaultThread();
      const now = Date.now();
      for (const id of ["ambiguous-one", "ambiguous-two"]) {
        insertMemory(db, {
          id,
          scope: "thread",
          threadId: thread.id,
          type: "fact",
          contentText: `memory ${id}`,
          tagsJson: "[]",
          importance: 0.5,
          confidence: 1,
          status: "active",
          supersedesMemoryId: null,
          createdFromMessageId: null,
          updatedFromMessageId: null,
          createdAtMs: now,
          updatedAtMs: now,
        });
      }

      expect(() => service.forgetMemory("ambiguous", thread.id)).toThrow(AmbiguousMemoryIdError);
    });
  });

  it("builds context sections in stable order", () => {
    withService(({ service }) => {
      const thread = service.getOrCreateDefaultThread();
      service.setObjective(thread.id, "Ship Milestone A.");
      service.appendUserMessage(thread.id, "Earlier message");
      service.remember({
        scope: "thread",
        threadId: thread.id,
        type: "decision",
        content: "Threads replace runs.",
        tags: ["architecture"],
      });
      const current = service.appendUserMessage(thread.id, "What replaces runs?");

      const context = buildThreadContext({
        service,
        threadId: thread.id,
        currentUserMessageId: current.id,
        config: BASE_CONFIG,
      });

      expect(context.messages.map((message) => message.role)).toEqual(["system", "user"]);
      expect(context.messages[0]?.content).toContain("Current objective: Ship Milestone A.");
      expect(context.messages[0]?.content).toContain("Relevant memories:");
      expect(context.messages[0]?.content).toContain("Threads replace runs.");
      expect(context.messages[0]?.content).toContain("Recent messages:");
      expect(context.messages[1]?.content).toBe("What replaces runs?");
      expect(context.sections.recentMessageCount).toBeGreaterThan(0);
    });
  });

  it("drops older recent messages before dropping current user message", () => {
    withService(({ service }) => {
      const config: IclawConfig = {
        ...BASE_CONFIG,
        context: {
          maxTokens: 120,
          responseReservePercent: 10,
          memoryPercent: 10,
          summaryPercent: 10,
          recentMessagesPercent: 70,
        },
      };
      const thread = service.getOrCreateDefaultThread();
      for (let index = 0; index < 8; index += 1) {
        service.appendUserMessage(thread.id, `old message ${index} ${"x".repeat(80)}`);
      }
      const current = service.appendUserMessage(thread.id, "current question must remain");

      const context = buildThreadContext({
        service,
        threadId: thread.id,
        currentUserMessageId: current.id,
        config,
      });

      expect(context.messages.at(-1)).toEqual({
        role: "user",
        content: "current question must remain",
      });
      expect(context.sections.recentMessageCount).toBeLessThan(9);
    });
  });
});
