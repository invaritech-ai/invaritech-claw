import type { DatabaseSync } from "node:sqlite";
import type { RunEventRecord, RunRecord, RunStatus } from "./schema.js";

type RunRow = {
  id: string;
  agent_id: string;
  trigger_type: RunRecord["triggerType"];
  trigger_id: string | null;
  status: RunStatus;
  input_json: string;
  result_json: string | null;
  error_json: string | null;
  approval_id: string | null;
  idempotency_key: string | null;
  created_at_ms: number;
  started_at_ms: number | null;
  finished_at_ms: number | null;
};

type RunEventRow = {
  id: number;
  run_id: string;
  seq: number;
  type: string;
  payload_json: string;
  created_at_ms: number;
};

function mapRunRow(row: RunRow): RunRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    triggerType: row.trigger_type,
    triggerId: row.trigger_id,
    status: row.status,
    inputJson: row.input_json,
    resultJson: row.result_json,
    errorJson: row.error_json,
    approvalId: row.approval_id,
    idempotencyKey: row.idempotency_key,
    createdAtMs: row.created_at_ms,
    startedAtMs: row.started_at_ms,
    finishedAtMs: row.finished_at_ms,
  };
}

function mapRunEventRow(row: RunEventRow): RunEventRecord {
  return {
    id: row.id,
    runId: row.run_id,
    seq: row.seq,
    type: row.type,
    payloadJson: row.payload_json,
    createdAtMs: row.created_at_ms,
  };
}

export function insertRun(db: DatabaseSync, run: RunRecord): void {
  db.prepare(
    `INSERT INTO runs (
      id, agent_id, trigger_type, trigger_id, status, input_json, result_json, error_json,
      approval_id, idempotency_key, created_at_ms, started_at_ms, finished_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    run.id,
    run.agentId,
    run.triggerType,
    run.triggerId,
    run.status,
    run.inputJson,
    run.resultJson,
    run.errorJson,
    run.approvalId,
    run.idempotencyKey,
    run.createdAtMs,
    run.startedAtMs,
    run.finishedAtMs,
  );
}

export function updateRunStatus(
  db: DatabaseSync,
  params: {
    runId: string;
    status: RunStatus;
    resultJson?: string | null;
    errorJson?: string | null;
    approvalId?: string | null;
    startedAtMs?: number | null;
    finishedAtMs?: number | null;
  },
): void {
  const hasResultJson = params.resultJson !== undefined;
  const hasErrorJson = params.errorJson !== undefined;
  const hasApprovalId = params.approvalId !== undefined;
  const hasStartedAtMs = params.startedAtMs !== undefined;
  const hasFinishedAtMs = params.finishedAtMs !== undefined;

  db.prepare(
    `UPDATE runs
     SET status = ?,
         result_json = CASE WHEN ? THEN ? ELSE result_json END,
         error_json = CASE WHEN ? THEN ? ELSE error_json END,
         approval_id = CASE WHEN ? THEN ? ELSE approval_id END,
         started_at_ms = CASE WHEN ? THEN ? ELSE started_at_ms END,
         finished_at_ms = CASE WHEN ? THEN ? ELSE finished_at_ms END
     WHERE id = ?`,
  ).run(
    params.status,
    hasResultJson ? 1 : 0,
    hasResultJson ? params.resultJson : null,
    hasErrorJson ? 1 : 0,
    hasErrorJson ? params.errorJson : null,
    hasApprovalId ? 1 : 0,
    hasApprovalId ? params.approvalId : null,
    hasStartedAtMs ? 1 : 0,
    hasStartedAtMs ? params.startedAtMs : null,
    hasFinishedAtMs ? 1 : 0,
    hasFinishedAtMs ? params.finishedAtMs : null,
    params.runId,
  );
}

export function getRunById(db: DatabaseSync, runId: string): RunRecord | undefined {
  const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as RunRow | undefined;
  return row ? mapRunRow(row) : undefined;
}

export function listRunsByAgent(db: DatabaseSync, agentId: string, limit = 100): RunRecord[] {
  const rows = db
    .prepare("SELECT * FROM runs WHERE agent_id = ? ORDER BY created_at_ms DESC LIMIT ?")
    .all(agentId, limit) as RunRow[];
  return rows.map(mapRunRow);
}

export function appendRunEvent(
  db: DatabaseSync,
  event: Omit<RunEventRecord, "id">,
): RunEventRecord {
  db.prepare(
    `INSERT INTO run_events (run_id, seq, type, payload_json, created_at_ms)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(event.runId, event.seq, event.type, event.payloadJson, event.createdAtMs);

  const row = db
    .prepare("SELECT * FROM run_events WHERE run_id = ? AND seq = ?")
    .get(event.runId, event.seq) as RunEventRow;
  return mapRunEventRow(row);
}

export function listRunEvents(db: DatabaseSync, runId: string): RunEventRecord[] {
  const rows = db
    .prepare("SELECT * FROM run_events WHERE run_id = ? ORDER BY seq ASC")
    .all(runId) as RunEventRow[];
  return rows.map(mapRunEventRow);
}
