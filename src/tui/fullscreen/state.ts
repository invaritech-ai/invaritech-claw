import type { ListedProviderModel } from "../../server/providers.js";
import type { Thread, ThreadMemory, ThreadMessage, ThreadSummary } from "../../threads/types.js";
import { parseOperatorCommand } from "../commands.js";
import type {
  NativeOperatorApiClient,
  OperatorMessageContext,
  OperatorThreadContext,
} from "../operator-api.js";

export const FULLSCREEN_ACTIVITIES = [
  "preparing context",
  "waiting for model",
  "saving response",
  "compacting",
  "loading models",
  "saving memory",
] as const;

export type FullscreenActivity = (typeof FULLSCREEN_ACTIVITIES)[number] | "idle";

export type FullscreenPanelKind =
  | "help"
  | "thread"
  | "model"
  | "memory"
  | "context"
  | "compact"
  | "summary"
  | "error";

export type FullscreenPanel = {
  kind: FullscreenPanelKind;
  title: string;
  body: string;
};

export type FullscreenRightRailState = {
  contextPercent: number | null;
  summaryState: "summary" | "no summary" | "unknown";
  recentMessageCount: number;
  memoryCount: number;
  activeModel: string;
  currentActivity: FullscreenActivity;
};

export type FullscreenTuiState = {
  agentId: string;
  serverUrl: string;
  activeThread: Thread | null;
  messages: ThreadMessage[];
  rightRail: FullscreenRightRailState;
  pendingOperation: string | null;
  activity: FullscreenActivity;
  panel: FullscreenPanel | null;
  detail: FullscreenPanel | null;
  lastError: string | null;
  shouldExit: boolean;
};

type TransientMessageInput = {
  id: string;
  threadId: string;
  role: ThreadMessage["role"];
  contentText: string;
  modelRef: string | null;
  createdAtMs: number;
  status?: ThreadMessage["status"];
};

function transientMessage(input: TransientMessageInput): ThreadMessage {
  return {
    id: input.id,
    threadId: input.threadId,
    role: input.role,
    contentText: input.contentText,
    modelRef: input.modelRef,
    status: input.status ?? "complete",
    createdAtMs: input.createdAtMs,
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function providerFromModel(modelRef: string): string {
  return modelRef.split("/", 1)[0] || "unknown";
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function estimateContextPercent(tokenEstimate: number): number {
  return clampPercent((tokenEstimate / 200_000) * 100);
}

function rightRailFrom(input: {
  thread: Thread | null;
  activity: FullscreenActivity;
  context?: OperatorMessageContext | OperatorThreadContext | null;
  messages?: ThreadMessage[];
}): FullscreenRightRailState {
  const context = input.context ?? null;
  return {
    contextPercent: context ? estimateContextPercent(context.tokenEstimate) : null,
    summaryState: context ? (context.sections.summary ? "summary" : "no summary") : "unknown",
    recentMessageCount: context?.sections.recentMessageCount ?? input.messages?.length ?? 0,
    memoryCount: context?.usedMemories.length ?? 0,
    activeModel: input.thread?.activeModelRef ?? "none",
    currentActivity: input.activity,
  };
}

function panel(kind: FullscreenPanelKind, title: string, body: string): FullscreenPanel {
  return { kind, title, body };
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatThread(thread: Thread): string {
  return `${thread.title} (${thread.id})\nmodel: ${thread.activeModelRef}\nobjective: ${
    thread.objective ?? "unset"
  }`;
}

function formatThreadList(threads: Thread[]): string {
  if (threads.length === 0) {
    return "no threads";
  }
  return threads
    .map((thread) =>
      [
        `${thread.title} (${thread.id})`,
        `model: ${thread.activeModelRef}`,
        `objective: ${thread.objective ?? "unset"}`,
        `archived: ${thread.archivedAtMs === null ? "no" : "yes"}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function formatMemory(memory: ThreadMemory): string {
  return [
    `${memory.id} [${memory.scope}/${memory.type}/${memory.status}]`,
    memory.contentText,
  ].join("\n");
}

function formatMemories(memories: ThreadMemory[]): string {
  return memories.length === 0 ? "no memories" : memories.map(formatMemory).join("\n\n");
}

function formatModels(models: ListedProviderModel[]): string {
  if (models.length === 0) {
    return "no models";
  }
  return models
    .map((model) => `${model.id} | provider: ${model.providerId} | model: ${model.modelId}`)
    .join("\n");
}

function formatSummary(summary: ThreadSummary | null): string {
  return summary ? summary.summaryText : "summary: none";
}

function formatContext(context: OperatorThreadContext | OperatorMessageContext): string {
  return [
    `tokens: ${context.tokenEstimate}`,
    `recent: ${context.sections.recentMessageCount}`,
    `memories: ${context.usedMemories.length}`,
    `summary: ${context.sections.summary ? "yes" : "none"}`,
  ].join("\n");
}

function helpText(): string {
  return [
    "commands:",
    "/help",
    "/thread list | /thread switch <id> | /thread rename <title> | /thread archive [id]",
    "/model | /model list | /model set <ref>",
    "/remember [global|thread] <text>",
    "/memory [thread|global] [query] | /memory-used | /forget <prefix>",
    "/context | /context full | /compact | /summary",
    "/exit",
  ].join("\n");
}

function activeThreadOrThrow(state: FullscreenTuiState): Thread {
  if (!state.activeThread) {
    throw new Error("no active thread; use /new or /thread switch <id>");
  }
  return state.activeThread;
}

function withActivity(state: FullscreenTuiState, activity: FullscreenActivity): FullscreenTuiState {
  return {
    ...state,
    activity,
    rightRail: {
      ...state.rightRail,
      currentActivity: activity,
    },
  };
}

function idleAfter(state: FullscreenTuiState): FullscreenTuiState {
  return withActivity({ ...state, pendingOperation: null }, "idle");
}

export function commandActivity(input: string): FullscreenActivity {
  const command = parseOperatorCommand(input);
  switch (command.type) {
    case "model.list":
      return "loading models";
    case "memory.remember":
    case "memory.list":
    case "memory.used":
    case "memory.forget":
      return "saving memory";
    case "context.preview":
    case "context.full":
      return "preparing context";
    case "compact":
      return "compacting";
    default:
      return "idle";
  }
}

export function beginFullscreenCommand(
  state: FullscreenTuiState,
  command: string,
): FullscreenTuiState {
  const activity = commandActivity(command);
  return withActivity(
    {
      ...state,
      pendingOperation: "command",
      lastError: null,
    },
    activity,
  );
}

export function createFullscreenTuiState(input: {
  agentId: string;
  serverUrl: string;
  activeThread: Thread | null;
  messages: ThreadMessage[];
}): FullscreenTuiState {
  const activity: FullscreenActivity = "idle";
  return {
    agentId: input.agentId,
    serverUrl: input.serverUrl,
    activeThread: input.activeThread,
    messages: input.messages,
    rightRail: rightRailFrom({
      thread: input.activeThread,
      activity,
      messages: input.messages,
    }),
    pendingOperation: null,
    activity,
    panel: null,
    detail: null,
    lastError: null,
    shouldExit: false,
  };
}

export async function initializeFullscreenTuiState(input: {
  agentId: string;
  serverUrl: string;
  client: NativeOperatorApiClient;
}): Promise<FullscreenTuiState> {
  const defaultTitle = input.agentId || "main";
  const threads = await input.client.listThreads({ limit: 100 });
  const activeThread =
    threads.find((thread) => thread.title === defaultTitle) ??
    (await input.client.createThread({ title: defaultTitle }));
  const messages = await input.client.listMessages(activeThread.id, { limit: 80 });
  const state = createFullscreenTuiState({
    agentId: input.agentId,
    serverUrl: input.serverUrl,
    activeThread,
    messages,
  });
  try {
    const context = await input.client.getContext(activeThread.id);
    return {
      ...state,
      rightRail: rightRailFrom({ thread: activeThread, activity: "idle", context }),
    };
  } catch {
    return state;
  }
}

export async function submitFullscreenPrompt(input: {
  state: FullscreenTuiState;
  client: NativeOperatorApiClient;
  content: string;
  nowMs?: number;
  onState?: (state: FullscreenTuiState) => void;
}): Promise<FullscreenTuiState> {
  const activeThread = activeThreadOrThrow(input.state);
  const nowMs = input.nowMs ?? Date.now();
  const modelRef = activeThread.activeModelRef;
  const userMessage = transientMessage({
    id: `local-user-${nowMs}`,
    threadId: activeThread.id,
    role: "user",
    contentText: input.content,
    modelRef: null,
    createdAtMs: nowMs,
  });
  const assistantPlaceholder = transientMessage({
    id: `local-assistant-${nowMs}`,
    threadId: activeThread.id,
    role: "assistant",
    contentText: `${modelRef} thinking...`,
    modelRef,
    createdAtMs: nowMs + 1,
  });
  const preparing = withActivity(
    {
      ...input.state,
      messages: [...input.state.messages, userMessage, assistantPlaceholder],
      pendingOperation: "prompt",
      panel: null,
      detail: null,
      lastError: null,
    },
    "preparing context",
  );
  input.onState?.(preparing);
  const optimistic = withActivity(
    {
      ...preparing,
      pendingOperation: "prompt",
      panel: null,
      detail: null,
      lastError: null,
    },
    "waiting for model",
  );
  input.onState?.(optimistic);

  try {
    const response = await input.client.postMessage(activeThread.id, { content: input.content });
    const messages = optimistic.messages.map((message) =>
      message.id === assistantPlaceholder.id ? response.message : message,
    );
    const saving = {
      ...optimistic,
      messages,
      pendingOperation: null,
      lastError: null,
      rightRail: rightRailFrom({
        thread: activeThread,
        activity: "saving response",
        context: response.context,
      }),
    };
    input.onState?.({ ...saving, activity: "saving response" });
    return idleAfter({ ...saving, activity: "saving response" });
  } catch (error) {
    const message = formatError(error);
    const errorMessage = transientMessage({
      id: assistantPlaceholder.id,
      threadId: activeThread.id,
      role: "assistant",
      contentText: `error: ${message}`,
      modelRef,
      status: "failed_partial",
      createdAtMs: nowMs + 1,
    });
    return {
      ...optimistic,
      messages: optimistic.messages.map((item) =>
        item.id === assistantPlaceholder.id ? errorMessage : item,
      ),
      pendingOperation: null,
      activity: "idle",
      rightRail: {
        ...optimistic.rightRail,
        currentActivity: "idle",
      },
      lastError: message,
      panel: panel("error", "Error", message),
    };
  }
}

async function runCommandInner(input: {
  state: FullscreenTuiState;
  client: NativeOperatorApiClient;
  command: string;
}): Promise<FullscreenTuiState> {
  const command = parseOperatorCommand(input.command);
  const state = input.state;
  const client = input.client;

  switch (command.type) {
    case "help":
      return { ...state, panel: panel("help", "Help", helpText()), detail: null };
    case "exit":
      return { ...state, shouldExit: true };
    case "status":
      return {
        ...state,
        panel: panel("thread", "Status", formatJson(await client.getStatus())),
        detail: null,
      };
    case "thread.new": {
      const thread = await client.createThread(command.title ? { title: command.title } : {});
      return {
        ...state,
        activeThread: thread,
        messages: [],
        rightRail: rightRailFrom({ thread, activity: "idle", messages: [] }),
        panel: panel("thread", "Thread", `active thread:\n${formatThread(thread)}`),
        detail: null,
      };
    }
    case "thread.list": {
      const threads = await client.listThreads({ limit: 20 });
      return {
        ...state,
        panel: panel("thread", "Threads", formatThreadList(threads)),
        detail: null,
      };
    }
    case "thread.switch": {
      const thread = await client.getThread(command.target);
      const messages = await client.listMessages(thread.id, { limit: 80 });
      return {
        ...state,
        activeThread: thread,
        messages,
        rightRail: rightRailFrom({ thread, activity: "idle", messages }),
        panel: panel("thread", "Thread", `active thread:\n${formatThread(thread)}`),
        detail: null,
      };
    }
    case "thread.rename": {
      const activeThread = activeThreadOrThrow(state);
      const thread = await client.patchThread(activeThread.id, { title: command.title });
      return {
        ...state,
        activeThread: thread,
        rightRail: rightRailFrom({ thread, activity: state.activity, messages: state.messages }),
        panel: panel("thread", "Thread", `renamed thread:\n${formatThread(thread)}`),
        detail: null,
      };
    }
    case "thread.archive": {
      const target = command.target ?? activeThreadOrThrow(state).id;
      const thread = await client.patchThread(target, { archived: true });
      const activeThread = state.activeThread?.id === target ? null : state.activeThread;
      return {
        ...state,
        activeThread,
        rightRail: rightRailFrom({
          thread: activeThread,
          activity: "idle",
          messages: state.messages,
        }),
        panel: panel("thread", "Thread", `archived thread:\n${formatThread(thread)}`),
        detail: null,
      };
    }
    case "objective.show": {
      const activeThread = activeThreadOrThrow(state);
      return {
        ...state,
        panel: panel(
          "thread",
          "Objective",
          activeThread.objective ? activeThread.objective : "objective: unset",
        ),
        detail: null,
      };
    }
    case "objective.set": {
      const activeThread = activeThreadOrThrow(state);
      const thread = await client.patchThread(activeThread.id, { objective: command.objective });
      return {
        ...state,
        activeThread: thread,
        panel: panel("thread", "Objective", thread.objective ?? "objective: unset"),
        detail: null,
      };
    }
    case "model.show": {
      const activeThread = activeThreadOrThrow(state);
      return {
        ...state,
        panel: panel("model", "Model", activeThread.activeModelRef),
        detail: null,
      };
    }
    case "model.list": {
      return {
        ...state,
        panel: panel("model", "Models", formatModels(await client.listModels())),
        detail: null,
        pendingOperation: null,
      };
    }
    case "model.set": {
      const activeThread = activeThreadOrThrow(state);
      const thread = await client.setThreadModel(activeThread.id, command.modelRef);
      return {
        ...state,
        activeThread: thread,
        rightRail: rightRailFrom({ thread, activity: state.activity, messages: state.messages }),
        panel: panel("model", "Model", thread.activeModelRef),
        detail: null,
      };
    }
    case "memory.remember": {
      const activeThread = activeThreadOrThrow(state);
      const memory = await client.remember(activeThread.id, {
        scope: command.scope,
        content: command.content,
      });
      return {
        ...state,
        panel: panel("memory", "Memory", `remembered:\n${formatMemory(memory)}`),
        detail: null,
      };
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
      return {
        ...state,
        rightRail: {
          ...state.rightRail,
          memoryCount: scopedMemories.length,
        },
        panel: panel("memory", "Memory", formatMemories(scopedMemories)),
        detail: null,
      };
    }
    case "memory.used": {
      const activeThread = activeThreadOrThrow(state);
      const memories = await client.getMemoryUsed(activeThread.id);
      return {
        ...state,
        rightRail: {
          ...state.rightRail,
          memoryCount: memories.length,
        },
        panel: panel("memory", "Memory Used", formatMemories(memories)),
        detail: null,
      };
    }
    case "memory.forget": {
      const activeThread = activeThreadOrThrow(state);
      const memory = await client.forgetMemory(activeThread.id, command.target);
      return {
        ...state,
        panel: panel("memory", "Memory", `forgot:\n${formatMemory(memory)}`),
        detail: null,
      };
    }
    case "context.preview": {
      const activeThread = activeThreadOrThrow(state);
      const context = await client.getContext(activeThread.id);
      return {
        ...state,
        rightRail: rightRailFrom({ thread: activeThread, activity: "idle", context }),
        panel: panel("context", "Context", formatContext(context)),
        detail: null,
      };
    }
    case "context.full": {
      const activeThread = activeThreadOrThrow(state);
      const context = await client.getContext(activeThread.id);
      return {
        ...state,
        rightRail: rightRailFrom({ thread: activeThread, activity: "idle", context }),
        panel: panel("context", "Context", formatJson(context)),
        detail: null,
      };
    }
    case "compact": {
      const activeThread = activeThreadOrThrow(state);
      const compacted = await client.compactThread(activeThread.id);
      return {
        ...state,
        rightRail: {
          ...state.rightRail,
          summaryState: "summary",
          currentActivity: "idle",
        },
        panel: panel("compact", "Compact", formatSummary(compacted.summary)),
        detail: null,
      };
    }
    case "summary": {
      const activeThread = activeThreadOrThrow(state);
      const summary = await client.getSummary(activeThread.id);
      return {
        ...state,
        rightRail: {
          ...state.rightRail,
          summaryState: summary ? "summary" : "no summary",
        },
        panel: panel("summary", "Summary", formatSummary(summary)),
        detail: null,
      };
    }
    case "prompts":
      return {
        ...state,
        panel: panel("help", "Prompts", "prompts: not available in thread-native operator console"),
        detail: null,
      };
    case "unknown":
      return {
        ...state,
        panel: panel("error", "Command", command.message),
        detail: null,
        lastError: command.message,
      };
  }
}

export async function runFullscreenCommand(input: {
  state: FullscreenTuiState;
  client: NativeOperatorApiClient;
  command: string;
}): Promise<FullscreenTuiState> {
  try {
    const nextState = {
      ...(await runCommandInner(input)),
      lastError: null,
    };
    return nextState.shouldExit ? nextState : idleAfter(nextState);
  } catch (error) {
    const message = formatError(error);
    return {
      ...input.state,
      pendingOperation: null,
      lastError: message,
      panel: panel("error", "Error", message),
      detail: null,
      activity: "idle",
      rightRail: {
        ...input.state.rightRail,
        currentActivity: "idle",
      },
    };
  }
}

function messageLines(messages: ThreadMessage[]): string[] {
  if (messages.length === 0) {
    return ["No messages yet."];
  }
  return messages.map((message) => `${message.role}: ${message.contentText}`);
}

export function buildFullscreenRenderSnapshot(state: FullscreenTuiState): string[] {
  const threadLabel = state.activeThread ? `${state.activeThread.title}` : "none";
  const modelRef = state.activeThread?.activeModelRef ?? "none";
  const provider = state.activeThread
    ? providerFromModel(state.activeThread.activeModelRef)
    : "none";
  const contextPercent =
    state.rightRail.contextPercent === null ? "--" : String(state.rightRail.contextPercent);
  return [
    `iclaw | thread ${threadLabel} | model ${modelRef} | server ${state.serverUrl} | provider ${provider}`,
    ...messageLines(state.messages),
    "compose:",
    `context: ${contextPercent}%`,
    `summary: ${state.rightRail.summaryState}`,
    `recent: ${state.rightRail.recentMessageCount}`,
    `memory: ${state.rightRail.memoryCount}`,
    `active model: ${state.rightRail.activeModel}`,
    `activity: ${state.rightRail.currentActivity}`,
    ...(state.panel ? [state.panel.title, state.panel.body] : []),
    ...(state.lastError ? [`error: ${state.lastError}`] : []),
    "/help /thread list /model list /memory /context /compact /exit",
  ];
}
