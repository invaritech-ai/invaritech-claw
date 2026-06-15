import type { LegacyRun } from "./legacy-run-types.js";
import type { NativeOperatorApiClient, OperatorStatus } from "./operator-api.js";
import { buildRunsView } from "./views/runs.js";
import { buildStatusView } from "./views/status.js";

export const OPERATOR_VIEWS = ["chat", "runs", "status"] as const;

export type OperatorView = (typeof OPERATOR_VIEWS)[number];

export type OperatorConsoleState = {
  activeView: OperatorView;
  selectedAgentId: string;
  runs: LegacyRun[];
  status: OperatorStatus | null;
  lastUpdatedAtMs: number | null;
  error: string | null;
};

export function createOperatorConsoleState(input?: {
  selectedAgentId?: string;
  activeView?: OperatorView;
}): OperatorConsoleState {
  return {
    activeView: input?.activeView ?? "chat",
    selectedAgentId: input?.selectedAgentId ?? "main",
    runs: [],
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
      case "runs":
        return {
          ...state,
          runs: await client.listRuns({ agentId: state.selectedAgentId }),
          error: null,
          lastUpdatedAtMs: nowMs,
        };
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

export function buildOperatorActiveView(state: OperatorConsoleState) {
  switch (state.activeView) {
    case "chat":
      return { title: "Chat" as const };
    case "runs":
      return buildRunsView(state.runs);
    case "status":
      return buildStatusView(state.status);
  }
}

function readOutputText(run: LegacyRun): string {
  const result = run.result;
  if (result && typeof result === "object") {
    const outputText = (result as { outputText?: unknown }).outputText;
    if (typeof outputText === "string") {
      return outputText;
    }
  }
  if (run.error && typeof run.error === "object") {
    const message = (run.error as { message?: unknown }).message;
    if (typeof message === "string") {
      return `error: ${message}`;
    }
  }
  return JSON.stringify(run, null, 2);
}

export async function runOperatorPrompt(input: {
  agentId: string;
  client: NativeOperatorApiClient;
  prompt: string;
}): Promise<string> {
  const run = await input.client.createRun({
    agentId: input.agentId,
    triggerType: "tui",
    input: { text: input.prompt },
    execute: true,
  });
  return readOutputText(run);
}

export async function runOperatorCommand(input: {
  agentId: string;
  client: NativeOperatorApiClient;
  command: string;
}): Promise<string | null> {
  const command = input.command.trim();
  if (command === "/exit" || command === "/quit") {
    return null;
  }
  if (command === "/status") {
    return JSON.stringify(await input.client.getStatus(), null, 2);
  }
  if (command === "/runs") {
    return JSON.stringify(await input.client.listRuns({ agentId: input.agentId }), null, 2);
  }
  return `unknown command: ${command}`;
}
