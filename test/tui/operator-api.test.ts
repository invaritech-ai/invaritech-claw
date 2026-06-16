import { describe, expect, it, vi } from "vitest";
import type {
  Thread,
  ThreadMemory,
  ThreadMessage,
  ThreadSummary,
} from "../../src/threads/types.js";
import {
  createNativeOperatorApiClient,
  NativeOperatorApiError,
} from "../../src/tui/operator-api.js";

type CapturedRequest = {
  url: URL;
  init?: RequestInit;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sampleThread(input: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    title: "Thread 1",
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
    contentText: "hello",
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
    summaryText: "Summary",
    coveredThroughMessageId: "message-1",
    sourceSummaryId: null,
    createdAtMs: 6,
    ...input,
  };
}

function createClientHarness(respond: (request: CapturedRequest) => Response | Promise<Response>) {
  const calls: CapturedRequest[] = [];
  const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
    const request = { url, init };
    calls.push(request);
    return await respond(request);
  });
  const client = createNativeOperatorApiClient({
    baseUrl: "http://127.0.0.1:48123",
    fetchImpl,
  });
  return { calls, client, fetchImpl };
}

function requestBody(call: CapturedRequest): unknown {
  return JSON.parse(String(call.init?.body));
}

describe("native operator API client", () => {
  it("lists threads with a limit query and unwraps threads", async () => {
    const thread = sampleThread();
    const { calls, client } = createClientHarness(() => jsonResponse({ threads: [thread] }));

    await expect(client.listThreads({ limit: 5 })).resolves.toEqual([thread]);

    expect(calls[0]?.init?.method ?? "GET").toBe("GET");
    expect(`${calls[0]?.url.pathname}${calls[0]?.url.search}`).toBe("/threads?limit=5");
  });

  it("posts a message to a thread", async () => {
    const message = sampleMessage();
    const memory = sampleMemory();
    const response = {
      message,
      invocationId: "invocation-1",
      context: {
        tokenEstimate: 12,
        sections: {
          objective: "Objective",
          memories: "Remember this.",
          summary: null,
          recentMessageCount: 1,
        },
        usedMemories: [memory],
      },
    };
    const { calls, client } = createClientHarness(() => jsonResponse(response, 201));

    await expect(client.postMessage("thread-1", { content: "hi" })).resolves.toEqual(response);

    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.url.pathname).toBe("/threads/thread-1/messages");
    expect(requestBody(calls[0]!)).toEqual({ content: "hi" });
  });

  it("sets a thread model", async () => {
    const thread = sampleThread({ activeModelRef: "ollama/next" });
    const { calls, client } = createClientHarness(() => jsonResponse(thread));

    await expect(client.setThreadModel("thread-1", "ollama/next")).resolves.toEqual(thread);

    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.url.pathname).toBe("/threads/thread-1/model");
    expect(requestBody(calls[0]!)).toEqual({ modelRef: "ollama/next" });
  });

  it("lists models and unwraps models", async () => {
    const models = [{ id: "ollama/test", providerId: "ollama", modelId: "test" }];
    const { calls, client } = createClientHarness(() => jsonResponse({ models }));

    await expect(client.listModels()).resolves.toEqual(models);

    expect(calls[0]?.init?.method ?? "GET").toBe("GET");
    expect(calls[0]?.url.pathname).toBe("/models");
  });

  it("remembers a thread memory", async () => {
    const memory = sampleMemory();
    const input = {
      content: "Remember this.",
      scope: "thread" as const,
      tags: ["api"],
    };
    const { calls, client } = createClientHarness(() => jsonResponse(memory, 201));

    await expect(client.remember("thread-1", input)).resolves.toEqual(memory);

    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.url.pathname).toBe("/threads/thread-1/memories");
    expect(requestBody(calls[0]!)).toEqual(input);
  });

  it("gets context and unwraps context", async () => {
    const context = {
      messages: [sampleMessage({ role: "user", contentText: "hi" })],
      sections: {
        objective: "Objective",
        memories: "",
        summary: null,
        recentMessageCount: 1,
      },
      tokenEstimate: 10,
      usedMemories: [],
    };
    const { calls, client } = createClientHarness(() => jsonResponse({ context }));

    await expect(client.getContext("thread-1")).resolves.toEqual(context);

    expect(calls[0]?.init?.method ?? "GET").toBe("GET");
    expect(calls[0]?.url.pathname).toBe("/threads/thread-1/context");
  });

  it("compacts a thread", async () => {
    const response = { summary: sampleSummary(), invocationId: "invocation-1" };
    const { calls, client } = createClientHarness(() => jsonResponse(response, 201));

    await expect(client.compactThread("thread-1")).resolves.toEqual(response);

    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.url.pathname).toBe("/threads/thread-1/compact");
  });

  it("throws API errors with status and path", async () => {
    const { client } = createClientHarness(() => jsonResponse({ error: "missing" }, 404));

    await expect(client.getThread("missing")).rejects.toMatchObject({
      name: "NativeOperatorApiError",
      status: 404,
      path: "/threads/missing",
    });
    await expect(client.getThread("missing")).rejects.toBeInstanceOf(NativeOperatorApiError);
  });
});
