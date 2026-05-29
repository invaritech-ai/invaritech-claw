import type { RunStatus, RunTriggerType } from "../storage/schema.js";

export type Run = {
  id: string;
  agentId: string;
  triggerType: RunTriggerType;
  triggerId: string | null;
  status: RunStatus;
  input: unknown;
  result: unknown | null;
  error: unknown | null;
  idempotencyKey: string | null;
  createdAtMs: number;
  startedAtMs: number | null;
  finishedAtMs: number | null;
};

export type RunEvent = {
  id: number;
  runId: string;
  seq: number;
  type: string;
  payload: unknown;
  createdAtMs: number;
};

export type CreateRunInput = {
  agentId: string;
  triggerType: RunTriggerType;
  input: unknown;
  triggerId?: string | null;
  idempotencyKey?: string | null;
  runId?: string;
  createdAtMs?: number;
};

export type ListRunsInput = {
  agentId: string;
  limit?: number;
};

export type AppendRunEventInput = {
  type: string;
  payload: unknown;
  seq?: number;
  createdAtMs?: number;
};
