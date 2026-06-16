import type { ListedProviderModel } from "../server/providers.js";
import type { Thread, ThreadMemory, ThreadSummary } from "../threads/types.js";
import { parseOperatorCommand } from "./commands.js";
import type { NativeOperatorApiClient, OperatorStatus } from "./operator-api.js";
import { buildStatusView } from "./views/status.js";

export const OPERATOR_VIEWS = ["chat", "status"] as const;

export type OperatorView = (typeof OPERATOR_VIEWS)[number];

export type OperatorConsoleState = {
  activeView: OperatorView;
  selectedAgentId: string;
  activeThread: Thread | null;
  status: OperatorStatus | null;
  lastUpdatedAtMs: number | null;
  error: string | null;
};

export type OperatorCommandResult = {
  state: OperatorConsoleState;
  output: string | null;
};

type ChatView = {
  title: "Chat";
  activeThread: {
    id: string;
    title: string;
    model: string;
  } | null;
};

export function createOperatorConsoleState(input?: {
  selectedAgentId?: string;
  activeView?: OperatorView;
  activeThread?: Thread | null;
}): OperatorConsoleState {
  return {
    activeView: input?.activeView ?? "chat",
    selectedAgentId: input?.selectedAgentId ?? "main",
    activeThread: input?.activeThread ?? null,
    status: null,
    lastUpdatedAtMs: null,
    error: null,
  };
}

export function switchOperatorView(
  state: OperatorConsoleState,
  activeView: OperatorView,
): OperatorConsoleState {
  return {
    ...state,
    activeView,
    error: null,
  };
}

export async function refreshOperatorView(
  state: OperatorConsoleState,
  client: NativeOperatorApiClient,
  nowMs = Date.now(),
): Promise<OperatorConsoleState> {
  try {
    switch (state.activeView) {
      case "chat":
        return { ...state, error: null, lastUpdatedAtMs: nowMs };
      case "status":
        return {
          ...state,
          status: await client.getStatus(),
          error: null,
          lastUpdatedAtMs: nowMs,
        };
    }
  } catch (error) {
    return {
      ...state,
      error: error instanceof Error ? error.message : String(error),
      lastUpdatedAtMs: nowMs,
    };
  }
}

export function buildOperatorActiveView(
  state: OperatorConsoleState,
): ChatView | ReturnType<typeof buildStatusView> {
  switch (state.activeView) {
    case "chat":
      return {
        title: "Chat",
        activeThread: state.activeThread
          ? {
              id: state.activeThread.id,
              title: state.activeThread.title,
              model: state.activeThread.activeModelRef,
            }
          : null,
      };
    case "status":
      return buildStatusView(state.status);
  }
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function activeThreadOrThrow(state: OperatorConsoleState): Thread {
  if (!state.activeThread) {
    throw new Error("no active thread; use /new or /thread switch <id>");
  }
  return state.activeThread;
}

function formatPromptOutput(
  contentText: string,
  input: { hasSummary: boolean; recent: number; memories: number },
): string {
  const summaryState = input.hasSummary ? "summary" : "no summary";
  return `${contentText}\ncontext: ${summaryState}, ${input.recent} recent messages, ${input.memories} memories`;
}

function formatThreadPreview(thread: Thread) {
  return {
    id: thread.id,
    title: thread.title,
    model: thread.activeModelRef,
    objective: thread.objective,
    archived: thread.archivedAtMs !== null,
  };
}

function formatMemory(memory: ThreadMemory) {
  return {
    id: memory.id,
    scope: memory.scope,
    threadId: memory.threadId,
    type: memory.type,
    status: memory.status,
    content: memory.contentText,
  };
}

function formatMemories(memories: ThreadMemory[]): string {
  return memories.length === 0 ? "[]" : formatJson(memories.map((memory) => formatMemory(memory)));
}

function formatSummary(summary: ThreadSummary | null): string {
  if (!summary) {
    return "summary: none";
  }
  return `summary: ${summary.summaryText}`;
}

function formatModels(models: ListedProviderModel[]): string {
  return formatJson(
    models.map((model) => ({
      id: model.id,
      provider: model.providerId,
      model: model.modelId,
      ...(model.name ? { name: model.name } : {}),
    })),
  );
}

function helpText(): string {
  return [
    "commands:",
    "/help",
    "/status",
    "/new [title]",
    "/thread list | /thread switch <id> | /thread rename <title> | /thread archive [id]",
    "/objective [text]",
    "/model | /model list | /model set <ref>",
    "/remember [global|thread] <text>",
    "/memory [thread|global] [query] | /memory-used | /forget <prefix>",
    "/context | /context full | /compact | /summary",
    "/exit",
  ].join("\n");
}

export async function runOperatorPrompt(input: {
  threadId: string;
  client: NativeOperatorApiClient;
  prompt: string;
}): Promise<string> {
  const response = await input.client.postMessage(input.threadId, { content: input.prompt });
  return formatPromptOutput(response.message.contentText, {
    hasSummary: response.context.sections.summary !== null,
    recent: response.context.sections.recentMessageCount,
    memories: response.context.usedMemories.length,
  });
}

export async function runOperatorCommand(input: {
  state: OperatorConsoleState;
  client: NativeOperatorApiClient;
  command: string;
}): Promise<OperatorCommandResult> {
  const command = parseOperatorCommand(input.command);
  const state = input.state;
  const client = input.client;

  switch (command.type) {
    case "help":
      return { state, output: helpText() };
    case "exit":
      return { state, output: null };
    case "status":
      return { state, output: formatJson(await client.getStatus()) };
    case "thread.new": {
      const thread = await client.createThread(command.title ? { title: command.title } : {});
      return {
        state: { ...state, activeThread: thread },
        output: `active thread: ${thread.title} (${thread.id})`,
      };
    }
    case "thread.list": {
      const threads = await client.listThreads({ limit: 20 });
      return { state, output: formatJson(threads.map((thread) => formatThreadPreview(thread))) };
    }
    case "thread.switch": {
      const thread = await client.getThread(command.target);
      return {
        state: { ...state, activeThread: thread },
        output: `active thread: ${thread.title} (${thread.id})`,
      };
    }
    case "thread.rename": {
      const activeThread = activeThreadOrThrow(state);
      const thread = await client.patchThread(activeThread.id, { title: command.title });
      return {
        state: { ...state, activeThread: thread },
        output: `renamed thread: ${thread.title} (${thread.id})`,
      };
    }
    case "thread.archive": {
      const target = command.target ?? activeThreadOrThrow(state).id;
      const thread = await client.patchThread(target, { archived: true });
      return {
        state: {
          ...state,
          activeThread: state.activeThread?.id === target ? null : state.activeThread,
        },
        output: `archived thread: ${thread.title} (${thread.id})`,
      };
    }
    case "objective.show": {
      const activeThread = activeThreadOrThrow(state);
      return {
        state,
        output: activeThread.objective
          ? `objective: ${activeThread.objective}`
          : "objective: unset",
      };
    }
    case "objective.set": {
      const activeThread = activeThreadOrThrow(state);
      const thread = await client.patchThread(activeThread.id, { objective: command.objective });
      return {
        state: { ...state, activeThread: thread },
        output: `objective: ${thread.objective ?? "unset"}`,
      };
    }
    case "model.show": {
      const activeThread = activeThreadOrThrow(state);
      return { state, output: `model: ${activeThread.activeModelRef}` };
    }
    case "model.list":
      return { state, output: formatModels(await client.listModels()) };
    case "model.set": {
      const activeThread = activeThreadOrThrow(state);
      const thread = await client.setThreadModel(activeThread.id, command.modelRef);
      return {
        state: { ...state, activeThread: thread },
        output: `model: ${thread.activeModelRef}`,
      };
    }
    case "memory.remember": {
      const activeThread = activeThreadOrThrow(state);
      const memory = await client.remember(activeThread.id, {
        scope: command.scope,
        content: command.content,
      });
      return { state, output: `remembered ${memory.id} (${memory.scope})` };
    }
    case "memory.list": {
      const activeThread = activeThreadOrThrow(state);
      const memories = await client.searchMemories(activeThread.id, {
        query: command.query ?? undefined,
        limit: 20,
      });
      const scopedMemories =
        command.scope === "active"
          ? memories
          : memories.filter((memory) => memory.scope === command.scope);
      return { state, output: formatMemories(scopedMemories) };
    }
    case "memory.used": {
      const activeThread = activeThreadOrThrow(state);
      return { state, output: formatMemories(await client.getMemoryUsed(activeThread.id)) };
    }
    case "memory.forget": {
      const activeThread = activeThreadOrThrow(state);
      const memory = await client.forgetMemory(activeThread.id, command.target);
      return { state, output: `forgot ${memory.id}` };
    }
    case "context.preview": {
      const activeThread = activeThreadOrThrow(state);
      const context = await client.getContext(activeThread.id);
      return {
        state,
        output: [
          `tokens: ${context.tokenEstimate}`,
          `recent: ${context.sections.recentMessageCount}`,
          `memories: ${context.usedMemories.length}`,
          `summary: ${context.sections.summary ? "yes" : "none"}`,
        ].join("\n"),
      };
    }
    case "context.full": {
      const activeThread = activeThreadOrThrow(state);
      const context = await client.getContext(activeThread.id);
      return { state, output: formatJson(context) };
    }
    case "compact": {
      const activeThread = activeThreadOrThrow(state);
      const compacted = await client.compactThread(activeThread.id);
      return { state, output: formatSummary(compacted.summary) };
    }
    case "summary": {
      const activeThread = activeThreadOrThrow(state);
      return { state, output: formatSummary(await client.getSummary(activeThread.id)) };
    }
    case "prompts":
      return { state, output: "prompts: not available in thread-native operator console" };
    case "unknown":
      return { state, output: command.message };
  }
}
