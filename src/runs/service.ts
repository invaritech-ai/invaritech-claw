import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  appendRunEvent,
  getRunById,
  insertRun,
  listRunEvents,
  listRunsByAgent,
  updateRunStatus,
} from "../storage/runs.js";
import type { RunEventRecord, RunRecord } from "../storage/schema.js";
import type { AppendRunEventInput, CreateRunInput, ListRunsInput, Run, RunEvent } from "./types.js";

function serializeJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? "null" : serialized;
}

function deserializeJson(value: string | null): unknown | null {
  if (value === null) {
    return null;
  }
  return JSON.parse(value) as unknown;
}

function mapRunRecord(record: RunRecord): Run {
  return {
    id: record.id,
    agentId: record.agentId,
    triggerType: record.triggerType,
    triggerId: record.triggerId,
    status: record.status,
    input: deserializeJson(record.inputJson),
    result: deserializeJson(record.resultJson),
    error: deserializeJson(record.errorJson),
    approvalId: record.approvalId,
    idempotencyKey: record.idempotencyKey,
    createdAtMs: record.createdAtMs,
    startedAtMs: record.startedAtMs,
    finishedAtMs: record.finishedAtMs,
  };
}

function mapRunEventRecord(record: RunEventRecord): RunEvent {
  return {
    id: record.id,
    runId: record.runId,
    seq: record.seq,
    type: record.type,
    payload: deserializeJson(record.payloadJson),
    createdAtMs: record.createdAtMs,
  };
}

function updateAndReadRun(
  db: DatabaseSync,
  runId: string,
  update: Parameters<typeof updateRunStatus>[1],
): Run | undefined {
  const existing = getRunById(db, runId);
  if (!existing) {
    return undefined;
  }
  updateRunStatus(db, update);
  const updated = getRunById(db, runId);
  return updated ? mapRunRecord(updated) : undefined;
}

export type RunService = ReturnType<typeof createRunService>;

export function createRunService(db: DatabaseSync) {
  return {
    createRun(input: CreateRunInput): Run {
      const now = input.createdAtMs ?? Date.now();
      const record: RunRecord = {
        id: input.runId ?? crypto.randomUUID(),
        agentId: input.agentId,
        triggerType: input.triggerType,
        triggerId: input.triggerId ?? null,
        status: "queued",
        inputJson: serializeJson(input.input),
        resultJson: null,
        errorJson: null,
        approvalId: null,
        idempotencyKey: input.idempotencyKey ?? null,
        createdAtMs: now,
        startedAtMs: null,
        finishedAtMs: null,
      };
      insertRun(db, record);
      return mapRunRecord(record);
    },

    getRun(runId: string): Run | undefined {
      const record = getRunById(db, runId);
      return record ? mapRunRecord(record) : undefined;
    },

    listRuns(input: ListRunsInput): Run[] {
      return listRunsByAgent(db, input.agentId, input.limit ?? 100).map(mapRunRecord);
    },

    appendEvent(runId: string, event: AppendRunEventInput): RunEvent {
      const nextSeq = event.seq ?? listRunEvents(db, runId).length + 1;
      const created = appendRunEvent(db, {
        runId,
        seq: nextSeq,
        type: event.type,
        payloadJson: serializeJson(event.payload),
        createdAtMs: event.createdAtMs ?? Date.now(),
      });
      return mapRunEventRecord(created);
    },

    listEvents(runId: string): RunEvent[] {
      return listRunEvents(db, runId).map(mapRunEventRecord);
    },

    markRunning(runId: string, startedAtMs = Date.now()): Run | undefined {
      return updateAndReadRun(db, runId, {
        runId,
        status: "running",
        startedAtMs,
      });
    },

    markSucceeded(runId: string, result: unknown, finishedAtMs = Date.now()): Run | undefined {
      return updateAndReadRun(db, runId, {
        runId,
        status: "succeeded",
        resultJson: serializeJson(result),
        errorJson: null,
        finishedAtMs,
      });
    },

    markFailed(runId: string, error: unknown, finishedAtMs = Date.now()): Run | undefined {
      return updateAndReadRun(db, runId, {
        runId,
        status: "failed",
        resultJson: null,
        errorJson: serializeJson(error),
        finishedAtMs,
      });
    },

    markWaitingApproval(runId: string, approvalId: string): Run | undefined {
      return updateAndReadRun(db, runId, {
        runId,
        status: "waiting_approval",
        approvalId,
      });
    },

    cancelRun(runId: string, finishedAtMs = Date.now()): Run | undefined {
      return updateAndReadRun(db, runId, {
        runId,
        status: "cancelled",
        finishedAtMs,
      });
    },
  };
}
