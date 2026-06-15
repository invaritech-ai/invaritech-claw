import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { IclawConfig } from "../config/types.js";
import type {
  MemoryRecord,
  MemoryScope,
  MemoryType,
  MessageStatus,
  ModelInvocationKind,
  ModelInvocationRecord,
  ModelInvocationStatus,
  ThreadRecord,
} from "../storage/schema.js";
import {
  getLatestThreadSummary,
  getMemoryById,
  getThreadById,
  insertMemory,
  insertMemoryEvent,
  insertMessage,
  insertModelInvocation,
  insertModelInvocationMemory,
  insertThread,
  listActiveThreads,
  listActiveMemoriesByIdPrefix,
  listInvocationMemories,
  listMessagesByThread,
  searchMemories,
  updateMemory,
  updateModelInvocation,
  updateThread,
  type MemorySearchInput,
} from "../storage/threads.js";

export type ThreadService = ReturnType<typeof createThreadService>;

export class ThreadNotFoundError extends Error {
  constructor(threadId: string) {
    super(`thread not found: ${threadId}`);
    this.name = "ThreadNotFoundError";
  }
}

export class MemoryNotFoundError extends Error {
  constructor(target: string) {
    super(`memory not found: ${target}`);
    this.name = "MemoryNotFoundError";
  }
}

export class AmbiguousMemoryIdError extends Error {
  constructor(target: string) {
    super(`memory id is ambiguous: ${target}`);
    this.name = "AmbiguousMemoryIdError";
  }
}

function serializeJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? "null" : serialized;
}

function requireThread(db: DatabaseSync, threadId: string): ThreadRecord {
  const thread = getThreadById(db, threadId);
  if (!thread) {
    throw new ThreadNotFoundError(threadId);
  }
  return thread;
}

function clamp01(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

function findMemoryByPrefix(db: DatabaseSync, target: string, threadId?: string): MemoryRecord {
  const direct = getMemoryById(db, target);
  if (
    direct &&
    direct.status === "active" &&
    (!threadId || direct.scope === "global" || direct.threadId === threadId)
  ) {
    return direct;
  }

  const candidates = listActiveMemoriesByIdPrefix(db, {
    prefix: target,
    threadId,
    limit: 100,
  });
  if (candidates.length === 0) {
    throw new MemoryNotFoundError(target);
  }
  if (candidates.length > 1) {
    throw new AmbiguousMemoryIdError(target);
  }
  return candidates[0]!;
}

export function createThreadService(input: { db: DatabaseSync; config: IclawConfig }) {
  const { db, config } = input;

  return {
    getOrCreateDefaultThread(): ThreadRecord {
      const existing = listActiveThreads(db, 1).find((thread) => thread.title === "main");
      if (existing) {
        return existing;
      }
      return this.createThread({ title: "main" });
    },

    createThread(threadInput: { title?: string; objective?: string | null; modelRef?: string }) {
      const now = Date.now();
      const thread: ThreadRecord = {
        id: crypto.randomUUID(),
        title: threadInput.title?.trim() || "main",
        objective: threadInput.objective?.trim() || null,
        activeModelRef: threadInput.modelRef?.trim() || config.models.chat,
        createdAtMs: now,
        updatedAtMs: now,
        archivedAtMs: null,
      };
      insertThread(db, thread);
      return thread;
    },

    listThreads(listInput: { limit?: number } = {}) {
      return listActiveThreads(db, listInput.limit ?? 100);
    },

    getThread(threadId: string) {
      return getThreadById(db, threadId);
    },

    archiveThread(threadId: string) {
      requireThread(db, threadId);
      const now = Date.now();
      updateThread(db, { id: threadId, archivedAtMs: now, updatedAtMs: now });
      return requireThread(db, threadId);
    },

    renameThread(threadId: string, title: string) {
      requireThread(db, threadId);
      updateThread(db, { id: threadId, title: title.trim(), updatedAtMs: Date.now() });
      return requireThread(db, threadId);
    },

    setObjective(threadId: string, objective: string | null) {
      requireThread(db, threadId);
      const normalized = objective?.trim() || null;
      updateThread(db, { id: threadId, objective: normalized, updatedAtMs: Date.now() });
      return requireThread(db, threadId);
    },

    setThreadModel(threadId: string, modelRef: string) {
      requireThread(db, threadId);
      updateThread(db, { id: threadId, activeModelRef: modelRef.trim(), updatedAtMs: Date.now() });
      return requireThread(db, threadId);
    },

    appendUserMessage(threadId: string, content: string) {
      requireThread(db, threadId);
      const message = {
        id: crypto.randomUUID(),
        threadId,
        role: "user" as const,
        contentText: content,
        modelRef: null,
        status: "complete" as const,
        createdAtMs: Date.now(),
      };
      insertMessage(db, message);
      updateThread(db, { id: threadId, updatedAtMs: message.createdAtMs });
      return message;
    },

    appendAssistantMessage(
      threadId: string,
      messageInput: { content: string; modelRef: string; status?: MessageStatus },
    ) {
      requireThread(db, threadId);
      const message = {
        id: crypto.randomUUID(),
        threadId,
        role: "assistant" as const,
        contentText: messageInput.content,
        modelRef: messageInput.modelRef,
        status: messageInput.status ?? "complete",
        createdAtMs: Date.now(),
      };
      insertMessage(db, message);
      updateThread(db, { id: threadId, updatedAtMs: message.createdAtMs });
      return message;
    },

    listMessages(threadId: string, limit = 100) {
      requireThread(db, threadId);
      return listMessagesByThread(db, threadId, limit);
    },

    getLatestSummary(threadId: string) {
      requireThread(db, threadId);
      return getLatestThreadSummary(db, threadId);
    },

    remember(memoryInput: {
      scope: MemoryScope;
      threadId?: string | null;
      type?: MemoryType;
      content: string;
      tags?: string[];
      importance?: number;
      confidence?: number;
      createdFromMessageId?: string | null;
    }) {
      if (memoryInput.scope === "thread" && !memoryInput.threadId) {
        throw new Error("thread memory requires threadId");
      }
      if (memoryInput.threadId) {
        requireThread(db, memoryInput.threadId);
      }
      const now = Date.now();
      const memory: MemoryRecord = {
        id: crypto.randomUUID(),
        scope: memoryInput.scope,
        threadId: memoryInput.scope === "thread" ? (memoryInput.threadId ?? null) : null,
        type: memoryInput.type ?? "fact",
        contentText: memoryInput.content,
        tagsJson: serializeJson(memoryInput.tags ?? []),
        importance: clamp01(memoryInput.importance, 0.5),
        confidence: clamp01(memoryInput.confidence, 1),
        status: "active",
        supersedesMemoryId: null,
        createdFromMessageId: memoryInput.createdFromMessageId ?? null,
        updatedFromMessageId: null,
        createdAtMs: now,
        updatedAtMs: now,
      };
      insertMemory(db, memory);
      insertMemoryEvent(db, {
        memoryId: memory.id,
        eventType: "created",
        payloadJson: serializeJson({ content: memory.contentText }),
        createdAtMs: now,
      });
      return memory;
    },

    searchMemories(searchInput: MemorySearchInput) {
      return searchMemories(db, searchInput);
    },

    forgetMemory(target: string, threadId?: string) {
      const memory = findMemoryByPrefix(db, target, threadId);
      const now = Date.now();
      updateMemory(db, { id: memory.id, status: "forgotten", updatedAtMs: now });
      insertMemoryEvent(db, {
        memoryId: memory.id,
        eventType: "forgotten",
        payloadJson: serializeJson({}),
        createdAtMs: now,
      });
      const updated = getMemoryById(db, memory.id);
      if (!updated) {
        throw new MemoryNotFoundError(target);
      }
      return updated;
    },

    recordInvocation(invocationInput: {
      threadId: string;
      userMessageId?: string | null;
      modelRef: string;
      kind: ModelInvocationKind;
    }): ModelInvocationRecord {
      requireThread(db, invocationInput.threadId);
      const invocation: ModelInvocationRecord = {
        id: crypto.randomUUID(),
        threadId: invocationInput.threadId,
        userMessageId: invocationInput.userMessageId ?? null,
        assistantMessageId: null,
        modelRef: invocationInput.modelRef,
        kind: invocationInput.kind,
        status: "running",
        errorJson: null,
        createdAtMs: Date.now(),
        finishedAtMs: null,
      };
      insertModelInvocation(db, invocation);
      return invocation;
    },

    finishInvocation(input: {
      invocationId: string;
      status: ModelInvocationStatus;
      assistantMessageId?: string | null;
      error?: unknown;
    }) {
      updateModelInvocation(db, {
        id: input.invocationId,
        status: input.status,
        assistantMessageId: input.assistantMessageId ?? null,
        errorJson: input.error === undefined ? null : serializeJson(input.error),
        finishedAtMs: Date.now(),
      });
    },

    recordInvocationMemories(
      invocationId: string,
      memories: Array<{ memoryId: string; score?: number | null }>,
    ) {
      memories.forEach((memory, index) => {
        insertModelInvocationMemory(db, {
          invocationId,
          memoryId: memory.memoryId,
          rank: index + 1,
          score: memory.score ?? null,
        });
      });
    },

    listInvocationMemories(invocationId: string) {
      return listInvocationMemories(db, invocationId);
    },
  };
}
