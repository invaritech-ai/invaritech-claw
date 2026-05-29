export type RunTriggerType = "tui" | "api";

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type RunRecord = {
  id: string;
  agentId: string;
  triggerType: RunTriggerType;
  triggerId: string | null;
  status: RunStatus;
  inputJson: string;
  resultJson: string | null;
  errorJson: string | null;
  idempotencyKey: string | null;
  createdAtMs: number;
  startedAtMs: number | null;
  finishedAtMs: number | null;
};

export type RunEventRecord = {
  id: number;
  runId: string;
  seq: number;
  type: string;
  payloadJson: string;
  createdAtMs: number;
};
