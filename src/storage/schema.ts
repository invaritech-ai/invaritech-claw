export type RunTriggerType = "tui" | "api" | "webhook" | "schedule";

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type ApprovalMode = "fail" | "pause";

export type AgentRecord = {
  id: string;
  configJson: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export type RunRecord = {
  id: string;
  agentId: string;
  triggerType: RunTriggerType;
  triggerId: string | null;
  status: RunStatus;
  inputJson: string;
  resultJson: string | null;
  errorJson: string | null;
  approvalId: string | null;
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

export type SessionRecord = {
  id: string;
  agentId: string;
  title: string | null;
  metadataJson: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export type SessionMessageRecord = {
  id: number;
  sessionId: string;
  role: string;
  contentJson: string;
  runId: string | null;
  createdAtMs: number;
};

export type ScheduleRecord = {
  id: string;
  agentId: string;
  enabled: boolean;
  scheduleJson: string;
  inputJson: string;
  approvalMode: ApprovalMode;
  nextRunAtMs: number | null;
  lastRunId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

export type WebhookRecord = {
  id: string;
  path: string;
  agentId: string;
  configJson: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export type WebhookDeliveryRecord = {
  id: string;
  webhookId: string;
  idempotencyKey: string | null;
  runId: string | null;
  requestJson: string;
  responseJson: string | null;
  status: string;
  createdAtMs: number;
};

export type ApprovalRecord = {
  id: string;
  runId: string;
  status: ApprovalStatus;
  requestJson: string;
  decisionJson: string | null;
  expiresAtMs: number;
  createdAtMs: number;
  decidedAtMs: number | null;
};

export type KvStateRecord = {
  namespace: string;
  key: string;
  valueJson: string;
  createdAtMs: number;
  updatedAtMs: number;
};
