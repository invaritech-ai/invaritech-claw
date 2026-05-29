import type { Run } from "../../runs/types.js";

export type RunsView = {
  title: "Runs";
  rows: Array<{
    id: string;
    agentId: string;
    status: Run["status"];
    trigger: string;
  }>;
};

export function buildRunsView(runs: Run[]): RunsView {
  return {
    title: "Runs",
    rows: runs.map((run) => ({
      id: run.id,
      agentId: run.agentId,
      status: run.status,
      trigger: run.triggerId ? `${run.triggerType}:${run.triggerId}` : run.triggerType,
    })),
  };
}
