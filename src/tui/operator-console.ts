import type { Run } from "../runs/types.js";
import type { Schedule } from "../scheduler/types.js";
import type { Webhook } from "../webhooks/types.js";
import type { ApprovalView, NativeOperatorApiClient, OperatorStatus } from "./operator-api.js";
import { buildRunsView, getRunApprovalActions } from "./views/runs.js";
import { buildSchedulesView } from "./views/schedules.js";
import { buildStatusView } from "./views/status.js";
import { buildWebhooksView } from "./views/webhooks.js";

export const OPERATOR_VIEWS = ["chat", "runs", "schedules", "webhooks", "status"] as const;

export type OperatorView = (typeof OPERATOR_VIEWS)[number];

export type OperatorConsoleState = {
  activeView: OperatorView;
  selectedAgentId: string;
  runs: Run[];
  schedules: Schedule[];
  webhooks: Webhook[];
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
    schedules: [],
    webhooks: [],
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
      case "schedules":
        return {
          ...state,
          schedules: await client.listSchedules(),
          error: null,
          lastUpdatedAtMs: nowMs,
        };
      case "webhooks":
        return {
          ...state,
          webhooks: await client.listWebhooks(),
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
    case "schedules":
      return buildSchedulesView(state.schedules);
    case "webhooks":
      return buildWebhooksView(state.webhooks);
    case "status":
      return buildStatusView(state.status);
  }
}

export function getWaitingRunApprovalControls(run: Run) {
  return getRunApprovalActions(run);
}

export async function approveRun(
  run: Run,
  client: NativeOperatorApiClient,
  decision?: unknown,
): Promise<ApprovalView | undefined> {
  const action = getRunApprovalActions(run).find((candidate) => candidate.kind === "approve");
  return action ? await client.approveApproval(action.approvalId, decision) : undefined;
}

export async function rejectRun(
  run: Run,
  client: NativeOperatorApiClient,
  decision?: unknown,
): Promise<ApprovalView | undefined> {
  const action = getRunApprovalActions(run).find((candidate) => candidate.kind === "reject");
  return action ? await client.rejectApproval(action.approvalId, decision) : undefined;
}
