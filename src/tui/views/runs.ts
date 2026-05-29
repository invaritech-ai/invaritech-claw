import type { Run } from "../../runs/types.js";

export type RunApprovalAction = {
  kind: "approve" | "reject";
  approvalId: string;
  label: string;
};

export type RunsView = {
  title: "Runs";
  rows: Array<{
    id: string;
    agentId: string;
    status: Run["status"];
    trigger: string;
    approvalActions: RunApprovalAction[];
  }>;
};

export function getRunApprovalActions(run: Run): RunApprovalAction[] {
  if (run.status !== "waiting_approval" || !run.approvalId) {
    return [];
  }
  return [
    { kind: "approve", approvalId: run.approvalId, label: "Approve" },
    { kind: "reject", approvalId: run.approvalId, label: "Reject" },
  ];
}

export function buildRunsView(runs: Run[]): RunsView {
  return {
    title: "Runs",
    rows: runs.map((run) => ({
      id: run.id,
      agentId: run.agentId,
      status: run.status,
      trigger: run.triggerId ? `${run.triggerType}:${run.triggerId}` : run.triggerType,
      approvalActions: getRunApprovalActions(run),
    })),
  };
}
