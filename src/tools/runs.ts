import type { RunService } from "../runs/service.js";

export type RunTools = ReturnType<typeof createRunTools>;

export function createRunTools(runService: RunService) {
  return {
    get(runId: string) {
      return runService.getRun(runId);
    },
    list(agentId: string, limit?: number) {
      return runService.listRuns({ agentId, limit });
    },
    events(runId: string) {
      return runService.listEvents(runId);
    },
    cancel(runId: string) {
      return runService.cancelRun(runId);
    },
  };
}
