import { describe, expect, it, vi } from "vitest";
import type {
  Thread,
  ThreadMemory,
  ThreadMessage,
  ThreadSummary,
} from "../../src/threads/types.js";
import {
  beginFullscreenCommand,
  createFullscreenTuiState,
  runFullscreenCommand,
  submitFullscreenPrompt,
} from "../../src/tui/fullscreen/state.js";
import type {
  NativeOperatorApiClient,
  OperatorMessageContext,
} from "../../src/tui/operator-api.js";

function sampleThread(input: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    title: "Main thread",
    objective: null,
    activeModelRef: "ollama/test",
    createdAtMs: 1,
    updatedAtMs: 2,
    archivedAtMs: null,
    ...input,
  };
}

function sampleMessage(input: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    role: "assistant",
    contentText: "assistant reply",
    modelRef: "ollama/test",
    status: "complete",
    createdAtMs: 3,
    ...input,
  };
}

function sampleMemory(input: Partial<ThreadMemory> = {}): ThreadMemory {
  return {
    id: "memory-1",
    scope: "thread",
    threadId: "thread-1",
    type: "fact",
    contentText: "Remember this.",
    tagsJson: "[]",
    importance: 0.5,
    confidence: 0.8,
    status: "active",
    supersedesMemoryId: null,
    createdFromMessageId: null,
    updatedFromMessageId: null,
    createdAtMs: 4,
    updatedAtMs: 5,
    ...input,
  };
}

function sampleSummary(input: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "summary-1",
    threadId: "thread-1",
    summaryText: "Summary text",
    coveredThroughMessageId: "message-1",
    sourceSummaryId: null,
    createdAtMs: 6,
    ...input,
  };
}

function sampleContext(input: Partial<OperatorMessageContext> = {}): OperatorMessageContext {
  return {
    tokenEstimate: 1200,
    sections: {
      objective: "Ship the TUI.",
      memories: "Remember this.",
      summary: "Earlier summary.",
      recentMessageCount: 2,
    },
    usedMemories: [sampleMemory()],
    ...input,
  };
}

function fakeClient(input: Partial<NativeOperatorApiClient> = {}): NativeOperatorApiClient {
  return {
    getStatus: vi.fn(async () => ({ ok: true })),
    listThreads: vi.fn(async () => [sampleThread()]),
    createThread: vi.fn(async ({ title }) =>
      sampleThread({ id: "thread-new", title: title ?? "" }),
    ),
    getThread: vi.fn(async (threadId) =>
      sampleThread({ id: threadId, title: `Thread ${threadId}` }),
    ),
    patchThread: vi.fn(async (threadId, patch) =>
      sampleThread({ id: threadId, title: patch.title ?? "Main thread" }),
    ),
    postMessage: vi.fn(async (threadId) => ({
      message: sampleMessage({ threadId, id: "assistant-1", contentText: "final answer" }),
      invocationId: "invocation-1",
      context: sampleContext(),
    })),
    listMessages: vi.fn(async () => [sampleMessage()]),
    setThreadModel: vi.fn(async (threadId, modelRef) =>
      sampleThread({ id: threadId, activeModelRef: modelRef }),
    ),
    listModels: vi.fn(async () => [
      { id: "ollama/test", providerId: "ollama" as const, modelId: "test", name: "Test" },
    ]),
    remember: vi.fn(async (_threadId, memory) =>
      sampleMemory({ scope: memory.scope ?? "thread", contentText: memory.content }),
    ),
    searchMemories: vi.fn(async () => [sampleMemory()]),
    forgetMemory: vi.fn(async (_threadId, prefix) => sampleMemory({ id: `${prefix}-memory` })),
    getContext: vi.fn(async () => ({
      ...sampleContext(),
      messages: [
        { role: "user" as const, content: "hello" },
        { role: "assistant" as const, content: "assistant reply" },
      ],
    })),
    getMemoryUsed: vi.fn(async () => [sampleMemory()]),
    compactThread: vi.fn(async () => ({
      summary: sampleSummary({ summaryText: "Compacted summary" }),
      invocationId: "invocation-2",
    })),
    getSummary: vi.fn(async () => sampleSummary()),
    ...input,
  };
}

describe("fullscreen TUI state", () => {
  it("optimistically appends a prompt and replaces the assistant placeholder with the response", async () => {
    const client = fakeClient();
    const snapshots: string[] = [];
    const activities: string[] = [];
    const state = createFullscreenTuiState({
      agentId: "main",
      serverUrl: "http://127.0.0.1:47823",
      activeThread: sampleThread(),
      messages: [],
    });

    const finalState = await submitFullscreenPrompt({
      state,
      client,
      content: "hello",
      nowMs: 100,
      onState(nextState) {
        snapshots.push(nextState.messages.map((message) => message.contentText).join(" | "));
        activities.push(nextState.activity);
      },
    });

    expect(client.postMessage).toHaveBeenCalledWith("thread-1", { content: "hello" });
    expect(snapshots).toEqual([
      "hello | ollama/test thinking...",
      "hello | ollama/test thinking...",
      "hello | final answer",
    ]);
    expect(activities).toEqual(["preparing context", "waiting for model", "saving response"]);
    expect(finalState.messages.map((message) => message.contentText)).toEqual([
      "hello",
      "final answer",
    ]);
    expect(finalState.activity).toBe("idle");
    expect(finalState.pendingOperation).toBeNull();
    expect(finalState.lastError).toBeNull();
    expect(finalState.rightRail).toMatchObject({
      summaryState: "summary",
      recentMessageCount: 2,
      memoryCount: 1,
      activeModel: "ollama/test",
      currentActivity: "idle",
    });
  });

  it("keeps the optimistic user message and records an error when prompt submission fails", async () => {
    const client = fakeClient({
      postMessage: vi.fn(async () => {
        throw new Error("model unavailable");
      }),
    });
    const state = createFullscreenTuiState({
      agentId: "main",
      serverUrl: "http://127.0.0.1:47823",
      activeThread: sampleThread(),
      messages: [],
    });

    const finalState = await submitFullscreenPrompt({
      state,
      client,
      content: "hello",
      nowMs: 100,
    });

    expect(finalState.messages.map((message) => message.contentText)).toEqual([
      "hello",
      "error: model unavailable",
    ]);
    expect(finalState.lastError).toBe("model unavailable");
    expect(finalState.pendingOperation).toBeNull();
  });

  it("renders slash command results into detail panels and updates right rail data", async () => {
    const client = fakeClient();
    const state = createFullscreenTuiState({
      agentId: "main",
      serverUrl: "http://127.0.0.1:47823",
      activeThread: sampleThread(),
      messages: [],
    });

    const memoryState = await runFullscreenCommand({ state, client, command: "/memory" });
    expect(memoryState.panel).toMatchObject({ title: "Memory", kind: "memory" });
    expect(memoryState.panel?.body).toContain("Remember this.");
    expect(memoryState.rightRail.memoryCount).toBe(1);
    expect(memoryState.activity).toBe("idle");

    const contextState = await runFullscreenCommand({
      state: memoryState,
      client,
      command: "/context",
    });
    expect(contextState.panel).toMatchObject({ title: "Context", kind: "context" });
    expect(contextState.panel?.body).toContain("tokens: 1200");
    expect(contextState.rightRail.summaryState).toBe("summary");

    const exitState = await runFullscreenCommand({ state: contextState, client, command: "/exit" });
    expect(exitState.shouldExit).toBe(true);
  });

  it("shows command activities before async command work completes", () => {
    const state = createFullscreenTuiState({
      agentId: "main",
      serverUrl: "http://127.0.0.1:47823",
      activeThread: sampleThread(),
      messages: [],
    });

    expect(beginFullscreenCommand(state, "/model list").activity).toBe("loading models");
    expect(beginFullscreenCommand(state, "/compact").activity).toBe("compacting");
    expect(beginFullscreenCommand(state, "/memory-used").activity).toBe("saving memory");
  });
});
