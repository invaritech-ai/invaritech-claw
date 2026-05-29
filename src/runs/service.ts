import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  appendRunEvent,
  getRunById,
  getRunByTriggerIdempotencyKey,
  insertRun,
  listRunEvents,
  listRunsByAgent,
  updateRunStatus,
} from "../storage/runs.js";
import type { RunEventRecord, RunRecord } from "../storage/schema.js";
import type { AppendRunEventInput, CreateRunInput, ListRunsInput, Run, RunEvent } from "./types.js";

type SqliteError = Error & {
  code?: string;
  errno?: number;
  errcode?: number;
  errstr?: string;
};

export class RunConflictError extends Error {
  code = "run_conflict" as const;
  reason: "duplicate_run_id" | "duplicate_idempotency";

  constructor(reason: "duplicate_run_id" | "duplicate_idempotency") {
    super(
      reason === "duplicate_run_id"
        ? "run id already exists"
        : "run idempotency key already exists",
    );
    this.name = "RunConflictError";
    this.reason = reason;
  }
}

export class RunNotFoundError extends Error {
  code = "run_not_found" as const;
  runId: string;

  constructor(runId: string) {
    super(`run not found: ${runId}`);
    this.name = "RunNotFoundError";
    this.runId = runId;
  }
}

export function isRunConflictError(error: unknown): error is RunConflictError {
  return error instanceof RunConflictError;
}

export function isRunNotFoundError(error: unknown): error is RunNotFoundError {
  return error instanceof RunNotFoundError;
}

function isSqliteConstraintError(error: unknown): error is SqliteError {
  if (!(error instanceof Error)) {
    return false;
  }
  const sqliteError = error as SqliteError;
  if (typeof sqliteError.code === "string" && sqliteError.code.startsWith("SQLITE_CONSTRAINT")) {
    return true;
  }
  if (sqliteError.errstr?.toLowerCase() === "constraint failed") {
    return true;
  }
  return sqliteError.errcode === 2067 || sqliteError.errcode === 1555;
}

function mapCreateConflictError(error: unknown): RunConflictError | undefined {
  if (!isSqliteConstraintError(error)) {
    return undefined;
  }
  const message = error.message.toLowerCase();
  if (message.includes("runs.id")) {
    return new RunConflictError("duplicate_run_id");
  }
  if (message.includes("idx_runs_idempotency") || message.includes("idempotency")) {
    return new RunConflictError("duplicate_idempotency");
  }
  return new RunConflictError("duplicate_idempotency");
}

function getNextRunEventSeq(db: DatabaseSync, runId: string): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM run_events WHERE run_id = ?")
    .get(runId) as { max_seq: number };
  return row.max_seq + 1;
}

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
        idempotencyKey: input.idempotencyKey ?? null,
        createdAtMs: now,
        startedAtMs: null,
        finishedAtMs: null,
      };
      try {
        insertRun(db, record);
      } catch (error) {
        const conflict = mapCreateConflictError(error);
        if (conflict) {
          throw conflict;
        }
        throw error;
      }
      return mapRunRecord(record);
    },

    getRun(runId: string): Run | undefined {
      const record = getRunById(db, runId);
      return record ? mapRunRecord(record) : undefined;
    },

    getRunByTriggerIdempotencyKey(input: {
      triggerType: RunRecord["triggerType"];
      triggerId: string | null;
      idempotencyKey: string;
    }): Run | undefined {
      const record = getRunByTriggerIdempotencyKey(db, input);
      return record ? mapRunRecord(record) : undefined;
    },

    listRuns(input: ListRunsInput): Run[] {
      return listRunsByAgent(db, input.agentId, input.limit ?? 100).map(mapRunRecord);
    },

    appendEvent(runId: string, event: AppendRunEventInput): RunEvent {
      const run = getRunById(db, runId);
      if (!run) {
        throw new RunNotFoundError(runId);
      }
      const nextSeq = event.seq ?? getNextRunEventSeq(db, runId);
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

    cancelRun(runId: string, finishedAtMs = Date.now()): Run | undefined {
      return updateAndReadRun(db, runId, {
        runId,
        status: "cancelled",
        finishedAtMs,
      });
    },
  };
}
