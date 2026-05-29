export type ScheduleSpec = { at: string } | { every: string } | { cron: string; timezone?: string };

export type Schedule = {
  id: string;
  agentId: string;
  enabled: boolean;
  schedule: ScheduleSpec;
  input: unknown;
  approvalMode: "fail" | "pause";
  nextRunAtMs: number | null;
  lastRunId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

export type CreateScheduleInput = {
  id?: string;
  agentId: string;
  schedule: ScheduleSpec;
  input?: unknown;
  approvalMode?: "fail" | "pause";
  enabled?: boolean;
  nowMs?: number;
};

export type PatchScheduleInput = {
  agentId?: string;
  schedule?: ScheduleSpec;
  input?: unknown;
  approvalMode?: "fail" | "pause";
  enabled?: boolean;
  nowMs?: number;
};
