import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type {
  Thread,
  ThreadMemory,
  ThreadMessage,
  ThreadSummary,
} from "../../src/threads/types.js";
import { runInteractiveOperatorConsole } from "../../src/tui/interactive.js";
import type {
  NativeOperatorApiClient,
  OperatorMessageContext,
  OperatorStatus,
} from "../../src/tui/operator-api.js";
import {
  buildOperatorActiveView,
  createOperatorConsoleState,
  refreshOperatorView,
  runOperatorCommand,
  runOperatorPrompt,
  switchOperatorView,
} from "../../src/tui/operator-console.js";

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
    tokenEstimate: 12,
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
      sampleThread({
        id: threadId,
        title: patch.title ?? "Main thread",
        objective: patch.objective === undefined ? null : patch.objective,
        archivedAtMs: patch.archived === true ? 10 : null,
      }),
    ),
    postMessage: vi.fn(async (threadId) => ({
      message: sampleMessage({ threadId }),
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
    forgetMemory: vi.fn(async (_threadId, prefix) =>
      sampleMemory({ id: `${prefix}-memory`, status: "forgotten" }),
    ),
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

function collectOutput(): { output: Writable; read(): string } {
  let text = "";
  return {
    output: new Writable({
      write(chunk, _encoding, callback) {
        text += String(chunk);
        callback();
      },
    }),
    read() {
      return text;
    },
  };
}

describe("operator console state", () => {
  it("tracks active thread state and refreshes status", async () => {
    const status: OperatorStatus = { ok: true, databasePath: "/tmp/iclaw.sqlite" };
    const client = fakeClient({ getStatus: vi.fn(async () => status) });
    const activeThread = sampleThread();

    let state = createOperatorConsoleState({ selectedAgentId: "main", activeThread });
    expect(buildOperatorActiveView(state)).toEqual({
      title: "Chat",
      activeThread: {
        id: "thread-1",
        title: "Main thread",
        model: "ollama/test",
      },
    });

    state = await refreshOperatorView(switchOperatorView(state, "status"), client, 100);
    expect(state.status).toEqual(status);
    expect(client.getStatus).toHaveBeenCalled();
    expect(buildOperatorActiveView(state).title).toBe("Status");
  });

  it("sends prompt input to the active thread and prints context metadata with summary state", async () => {
    const postMessage = vi.fn(async () => ({
      message: sampleMessage({ contentText: "assistant reply" }),
      invocationId: "invocation-1",
      context: sampleContext(),
    }));
    const client = fakeClient({ postMessage });

    const output = await runOperatorPrompt({
      threadId: "thread-1",
      client,
      prompt: "hello",
    });

    expect(postMessage).toHaveBeenCalledWith("thread-1", { content: "hello" });
    expect(output).toBe("assistant reply\ncontext: summary, 2 recent messages, 1 memories");
  });

  it("prints no summary in prompt context metadata when the response omits summary", async () => {
    const postMessage = vi.fn(async () => ({
      message: sampleMessage({ contentText: "assistant reply" }),
      invocationId: "invocation-1",
      context: sampleContext({
        sections: {
          objective: "Ship the TUI.",
          memories: "Remember this.",
          summary: null,
          recentMessageCount: 2,
        },
      }),
    }));
    const client = fakeClient({ postMessage });

    const output = await runOperatorPrompt({
      threadId: "thread-1",
      client,
      prompt: "hello",
    });

    expect(output).toBe("assistant reply\ncontext: no summary, 2 recent messages, 1 memories");
  });

  it("handles status, thread list, model list, remember, memory, context, compact, summary, and exit commands", async () => {
    const client = fakeClient();
    const state = createOperatorConsoleState({ activeThread: sampleThread() });

    await expect(runOperatorCommand({ state, client, command: "/status" })).resolves.toMatchObject({
      output: expect.stringContaining('"ok": true') as string,
    });
    await expect(
      runOperatorCommand({ state, client, command: "/thread list" }),
    ).resolves.toMatchObject({
      output: expect.stringContaining("thread-1") as string,
    });
    await expect(
      runOperatorCommand({ state, client, command: "/model list" }),
    ).resolves.toMatchObject({
      output: expect.stringContaining("ollama/test") as string,
    });

    const remember = await runOperatorCommand({
      state,
      client,
      command: "/remember global User prefers concise output.",
    });
    expect(client.remember).toHaveBeenCalledWith("thread-1", {
      scope: "global",
      content: "User prefers concise output.",
    });
    expect(remember.output).toContain("remembered memory-1");

    const memory = await runOperatorCommand({ state, client, command: "/memory thread concise" });
    expect(client.searchMemories).toHaveBeenCalledWith("thread-1", {
      query: "concise",
      limit: 20,
    });
    expect(memory.output).toContain("Remember this.");

    await expect(runOperatorCommand({ state, client, command: "/context" })).resolves.toMatchObject(
      {
        output: expect.stringContaining("recent: 2") as string,
      },
    );
    await expect(runOperatorCommand({ state, client, command: "/compact" })).resolves.toMatchObject(
      {
        output: expect.stringContaining("Compacted summary") as string,
      },
    );
    await expect(runOperatorCommand({ state, client, command: "/summary" })).resolves.toMatchObject(
      {
        output: expect.stringContaining("Summary text") as string,
      },
    );
    await expect(runOperatorCommand({ state, client, command: "/exit" })).resolves.toMatchObject({
      output: null,
    });
  });

  it("updates active thread through thread, objective, and model commands", async () => {
    const client = fakeClient();
    const state = createOperatorConsoleState({ activeThread: sampleThread() });

    const created = await runOperatorCommand({ state, client, command: "/new Build memory" });
    expect(client.createThread).toHaveBeenCalledWith({ title: "Build memory" });
    expect(created.state.activeThread?.id).toBe("thread-new");

    const switched = await runOperatorCommand({
      state,
      client,
      command: "/thread switch thread-2",
    });
    expect(client.getThread).toHaveBeenCalledWith("thread-2");
    expect(switched.state.activeThread?.id).toBe("thread-2");

    const renamed = await runOperatorCommand({
      state,
      client,
      command: "/thread rename New title",
    });
    expect(client.patchThread).toHaveBeenCalledWith("thread-1", { title: "New title" });
    expect(renamed.state.activeThread?.title).toBe("New title");

    const objective = await runOperatorCommand({
      state,
      client,
      command: "/objective Ship Milestone A",
    });
    expect(client.patchThread).toHaveBeenCalledWith("thread-1", {
      objective: "Ship Milestone A",
    });
    expect(objective.state.activeThread?.objective).toBe("Ship Milestone A");

    const model = await runOperatorCommand({
      state,
      client,
      command: "/model set ollama/next",
    });
    expect(client.setThreadModel).toHaveBeenCalledWith("thread-1", "ollama/next");
    expect(model.state.activeThread?.activeModelRef).toBe("ollama/next");

    const archived = await runOperatorCommand({ state, client, command: "/thread archive" });
    expect(client.patchThread).toHaveBeenCalledWith("thread-1", { archived: true });
    expect(archived.state.activeThread).toBeNull();
  });

  it("opens an existing default thread for the interactive loop and routes prompt plus commands", async () => {
    const output = collectOutput();
    const client = fakeClient({
      listThreads: vi.fn(async () => [sampleThread({ id: "thread-existing", title: "main" })]),
    });

    await runInteractiveOperatorConsole({
      agentId: "main",
      client,
      input: Readable.from(["hello\n/status\n/exit\n"]),
      output: output.output,
    });

    expect(client.listThreads).toHaveBeenCalledWith({ limit: 100 });
    expect(client.createThread).not.toHaveBeenCalled();
    expect(client.postMessage).toHaveBeenCalledWith("thread-existing", { content: "hello" });
    expect(output.read()).toContain("thread: main (thread-existing)");
    expect(output.read()).toContain("model: ollama/test");
    expect(output.read()).toContain("assistant reply");
    expect(output.read()).toContain('"ok": true');
  });

  it("opens the default thread when another active thread is listed first", async () => {
    const output = collectOutput();
    const client = fakeClient({
      listThreads: vi.fn(async () => [
        sampleThread({ id: "thread-other", title: "Research" }),
        sampleThread({ id: "thread-main", title: "main" }),
      ]),
    });

    await runInteractiveOperatorConsole({
      agentId: "main",
      client,
      input: Readable.from(["hello\n/exit\n"]),
      output: output.output,
    });

    expect(client.listThreads).toHaveBeenCalledWith({ limit: 100 });
    expect(client.postMessage).toHaveBeenCalledWith("thread-main", { content: "hello" });
    expect(output.read()).toContain("thread: main (thread-main)");
  });

  it("creates a default thread for the interactive loop when none exists", async () => {
    const output = collectOutput();
    const client = fakeClient({
      listThreads: vi.fn(async () => []),
      createThread: vi.fn(async ({ title }) => sampleThread({ id: "thread-created", title })),
    });

    await runInteractiveOperatorConsole({
      agentId: "main",
      client,
      input: Readable.from(["hello\n/exit\n"]),
      output: output.output,
    });

    expect(client.createThread).toHaveBeenCalledWith({ title: "main" });
    expect(client.postMessage).toHaveBeenCalledWith("thread-created", { content: "hello" });
    expect(output.read()).toContain("thread: main (thread-created)");
  });

  it("uses the new active thread for prompts after an interactive switch command", async () => {
    const output = collectOutput();
    const client = fakeClient({
      listThreads: vi.fn(async () => [sampleThread({ id: "thread-1" })]),
      getThread: vi.fn(async (threadId) => sampleThread({ id: threadId, title: "Switched" })),
    });

    await runInteractiveOperatorConsole({
      agentId: "main",
      client,
      input: Readable.from(["/thread switch thread-2\nhello\n/exit\n"]),
      output: output.output,
    });

    expect(client.postMessage).toHaveBeenCalledWith("thread-2", { content: "hello" });
    expect(output.read()).toContain("active thread: Switched (thread-2)");
  });

  it("prints a clear interactive prompt error when no active thread remains", async () => {
    const output = collectOutput();
    const client = fakeClient({
      listThreads: vi.fn(async () => [sampleThread({ id: "thread-1", title: "main" })]),
    });

    await runInteractiveOperatorConsole({
      agentId: "main",
      client,
      input: Readable.from(["/thread archive\nhello\n/exit\n"]),
      output: output.output,
    });

    expect(client.postMessage).not.toHaveBeenCalled();
    expect(output.read()).toContain("error: no active thread; use /new or /thread switch <id>");
  });

  it("prints command errors and continues the interactive loop", async () => {
    const output = collectOutput();
    const client = fakeClient({
      listThreads: vi.fn(async () => [sampleThread({ id: "thread-1", title: "main" })]),
    });

    await runInteractiveOperatorConsole({
      agentId: "main",
      client,
      input: Readable.from(["/thread archive\n", "/model\n", "/exit\n"]),
      output: output.output,
    });

    expect(output.read()).toContain("archived thread: Main thread (thread-1)");
    expect(output.read()).toContain("error: no active thread; use /new or /thread switch <id>");
  });

  it("prints prompt errors and continues the interactive loop", async () => {
    const output = collectOutput();
    const postMessage = vi.fn(async () => {
      throw new Error("post failed");
    });
    const client = fakeClient({
      listThreads: vi.fn(async () => [sampleThread({ id: "thread-1", title: "main" })]),
      postMessage,
    });

    await runInteractiveOperatorConsole({
      agentId: "main",
      client,
      input: Readable.from(["hello\n", "/status\n", "/exit\n"]),
      output: output.output,
    });

    expect(postMessage).toHaveBeenCalledWith("thread-1", { content: "hello" });
    expect(output.read()).toContain("error: post failed");
    expect(output.read()).toContain('"ok": true');
  });
});
