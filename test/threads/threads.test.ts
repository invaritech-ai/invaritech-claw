import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  MemoryRecord,
  MessageRecord,
  ModelInvocationRecord,
  ThreadRecord,
  ThreadSummaryRecord,
} from "../../src/storage/schema.js";
import { openIclawDatabase } from "../../src/storage/sqlite.js";
import {
  getLatestThreadSummary,
  getThreadById,
  insertMemory,
  insertMemoryEvent,
  insertMessage,
  insertModelInvocation,
  insertModelInvocationMemory,
  insertThread,
  insertThreadSummary,
  listActiveThreads,
  listInvocationMemories,
  listMessagesByThread,
  searchMemories,
  updateMemory,
  updateModelInvocation,
  updateThread,
} from "../../src/storage/threads.js";

function withDatabase(callback: (db: DatabaseSync) => void): void {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "iclaw-threads-test-"));
  const dbPath = path.join(tempDir, "state.sqlite");
  const db = openIclawDatabase(dbPath);

  try {
    callback(db);
  } finally {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function baseThread(patch: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id: "thread-1",
    title: "Import task",
    objective: "Keep importer state",
    activeModelRef: "ollama:llama3.2",
    createdAtMs: 1_000,
    updatedAtMs: 1_000,
    archivedAtMs: null,
    ...patch,
  };
}

function baseMessage(patch: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: "message-1",
    threadId: "thread-1",
    role: "user",
    contentText: "Please inspect the importer.",
    modelRef: null,
    status: "complete",
    createdAtMs: 1_100,
    ...patch,
  };
}

function baseMemory(patch: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "memory-1",
    scope: "thread",
    threadId: "thread-1",
    type: "fact",
    contentText: "Importer listens on loopback ports only.",
    tagsJson: JSON.stringify(["importer", "ports"]),
    importance: 0.7,
    confidence: 0.8,
    status: "active",
    supersedesMemoryId: null,
    createdFromMessageId: null,
    updatedFromMessageId: null,
    createdAtMs: 1_200,
    updatedAtMs: 1_200,
    ...patch,
  };
}

function baseInvocation(patch: Partial<ModelInvocationRecord> = {}): ModelInvocationRecord {
  return {
    id: "invocation-1",
    threadId: "thread-1",
    userMessageId: "message-1",
    assistantMessageId: null,
    modelRef: "ollama:llama3.2",
    kind: "chat",
    status: "running",
    errorJson: null,
    createdAtMs: 1_300,
    finishedAtMs: null,
    ...patch,
  };
}

describe("thread storage repository", () => {
  it("creates a thread and appends messages in order", () => {
    withDatabase((db) => {
      const thread = baseThread();
      insertThread(db, thread);
      insertMessage(db, baseMessage({ id: "message-2", role: "assistant", createdAtMs: 1_200 }));
      insertMessage(db, baseMessage({ id: "message-1", role: "user", createdAtMs: 1_100 }));

      expect(getThreadById(db, "thread-1")).toEqual(thread);
      expect(listActiveThreads(db, 10).map((row) => row.id)).toEqual(["thread-1"]);
      expect(listMessagesByThread(db, "thread-1").map((message) => message.id)).toEqual([
        "message-1",
        "message-2",
      ]);
    });
  });

  it("orders same-millisecond messages by insertion order", () => {
    withDatabase((db) => {
      insertThread(db, baseThread());
      insertMessage(db, baseMessage({ id: "message-z", role: "user", createdAtMs: 1_100 }));
      insertMessage(db, baseMessage({ id: "message-a", role: "assistant", createdAtMs: 1_100 }));

      expect(listMessagesByThread(db, "thread-1").map((message) => message.id)).toEqual([
        "message-z",
        "message-a",
      ]);
    });
  });

  it("archives threads without deleting messages", () => {
    withDatabase((db) => {
      insertThread(db, baseThread());
      insertMessage(db, baseMessage());

      updateThread(db, { id: "thread-1", archivedAtMs: 1_500, updatedAtMs: 1_500 });

      expect(getThreadById(db, "thread-1")?.archivedAtMs).toBe(1_500);
      expect(listActiveThreads(db, 10)).toEqual([]);
      expect(listMessagesByThread(db, "thread-1")).toHaveLength(1);
    });
  });

  it("creates, searches, and forgets memories through FTS", () => {
    withDatabase((db) => {
      insertThread(db, baseThread());
      insertMemory(
        db,
        baseMemory({
          id: "memory-thread",
          scope: "thread",
          threadId: "thread-1",
          contentText: "Importer listens on loopback ports only.",
        }),
      );
      insertMemory(
        db,
        baseMemory({
          id: "memory-global",
          scope: "global",
          threadId: null,
          contentText: "All local tools should prefer loopback ports.",
        }),
      );
      insertMemory(
        db,
        baseMemory({
          id: "memory-other-thread",
          scope: "thread",
          threadId: "thread-2",
          contentText: "Other thread also mentions loopback ports.",
        }),
      );
      insertMemory(
        db,
        baseMemory({
          id: "memory-forgotten",
          contentText: "Forgotten importer loopback ports note.",
          status: "forgotten",
        }),
      );

      expect(
        new Set(
          searchMemories(db, {
            query: "loopback ports",
            scope: "thread_and_global",
            threadId: "thread-1",
            limit: 10,
          }).map((memory) => memory.id),
        ),
      ).toEqual(new Set(["memory-thread", "memory-global"]));
      expect(
        searchMemories(db, { query: "loopback ports", scope: "global", limit: 10 }).map(
          (memory) => memory.id,
        ),
      ).toEqual(["memory-global"]);

      updateMemory(db, { id: "memory-thread", status: "forgotten", updatedAtMs: 1_600 });
      insertMemoryEvent(db, {
        memoryId: "memory-thread",
        eventType: "forgotten",
        payloadJson: JSON.stringify({ reason: "test" }),
        createdAtMs: 1_600,
      });

      expect(
        searchMemories(db, {
          query: "loopback ports",
          scope: "thread_and_global",
          threadId: "thread-1",
          limit: 10,
        }).map((memory) => memory.id),
      ).toEqual(["memory-global"]);
    });
  });

  it("records summaries, model invocations, and memories used", () => {
    withDatabase((db) => {
      insertThread(db, baseThread());
      insertMessage(db, baseMessage());
      insertMemory(db, baseMemory({ id: "memory-a", contentText: "Use the import cache." }));
      insertMemory(db, baseMemory({ id: "memory-b", contentText: "Do not delete local data." }));
      const summary: ThreadSummaryRecord = {
        id: "summary-1",
        threadId: "thread-1",
        summaryText: "Importer context.",
        coveredThroughMessageId: "message-1",
        sourceSummaryId: null,
        createdAtMs: 1_250,
      };
      insertThreadSummary(db, summary);
      const invocation = baseInvocation();
      insertModelInvocation(db, invocation);

      updateModelInvocation(db, {
        id: "invocation-1",
        status: "succeeded",
        assistantMessageId: "message-2",
        finishedAtMs: 1_400,
      });
      insertModelInvocationMemory(db, {
        invocationId: "invocation-1",
        memoryId: "memory-b",
        rank: 1,
        score: 0.9,
      });
      insertModelInvocationMemory(db, {
        invocationId: "invocation-1",
        memoryId: "memory-a",
        rank: 2,
        score: 0.7,
      });

      expect(getLatestThreadSummary(db, "thread-1")).toEqual(summary);
      expect(listInvocationMemories(db, "invocation-1")).toEqual([
        { invocationId: "invocation-1", memoryId: "memory-b", rank: 1, score: 0.9 },
        { invocationId: "invocation-1", memoryId: "memory-a", rank: 2, score: 0.7 },
      ]);
    });
  });
});
