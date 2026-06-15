// Temporary TUI-only run shape until Milestone A Task 5 replaces the operator console.
export type LegacyRunTriggerType = "tui" | "api";

export type LegacyRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type LegacyRun = {
  id: string;
  agentId: string;
  triggerType: LegacyRunTriggerType;
  triggerId: string | null;
  status: LegacyRunStatus;
  input: unknown;
  result: unknown | null;
  error: unknown | null;
  idempotencyKey: string | null;
  createdAtMs: number;
  startedAtMs: number | null;
  finishedAtMs: number | null;
};
