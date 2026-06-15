import type { LegacyRun } from "../legacy-run-types.js";

export type RunsView = {
  title: "Runs";
  rows: Array<{
    id: string;
    agentId: string;
    status: LegacyRun["status"];
    trigger: string;
  }>;
};

export function buildRunsView(runs: LegacyRun[]): RunsView {
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
