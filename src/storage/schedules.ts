import type { DatabaseSync } from "node:sqlite";
import type { ScheduleRecord } from "./schema.js";

type ScheduleRow = {
  id: string;
  agent_id: string;
  enabled: number;
  schedule_json: string;
  input_json: string;
  approval_mode: ScheduleRecord["approvalMode"];
  next_run_at_ms: number | null;
  last_run_id: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};

function mapScheduleRow(row: ScheduleRow): ScheduleRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    enabled: row.enabled === 1,
    scheduleJson: row.schedule_json,
    inputJson: row.input_json,
    approvalMode: row.approval_mode,
    nextRunAtMs: row.next_run_at_ms,
    lastRunId: row.last_run_id,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export function upsertSchedule(db: DatabaseSync, schedule: ScheduleRecord): void {
  db.prepare(
    `INSERT INTO schedules (
      id, agent_id, enabled, schedule_json, input_json, approval_mode,
      next_run_at_ms, last_run_id, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      agent_id = excluded.agent_id,
      enabled = excluded.enabled,
      schedule_json = excluded.schedule_json,
      input_json = excluded.input_json,
      approval_mode = excluded.approval_mode,
      next_run_at_ms = excluded.next_run_at_ms,
      last_run_id = excluded.last_run_id,
      updated_at_ms = excluded.updated_at_ms`,
  ).run(
    schedule.id,
    schedule.agentId,
    schedule.enabled ? 1 : 0,
    schedule.scheduleJson,
    schedule.inputJson,
    schedule.approvalMode,
    schedule.nextRunAtMs,
    schedule.lastRunId,
    schedule.createdAtMs,
    schedule.updatedAtMs,
  );
}

export function getScheduleById(db: DatabaseSync, scheduleId: string): ScheduleRecord | undefined {
  const row = db.prepare("SELECT * FROM schedules WHERE id = ?").get(scheduleId) as
    | ScheduleRow
    | undefined;
  return row ? mapScheduleRow(row) : undefined;
}

export function listSchedules(db: DatabaseSync, limit = 100): ScheduleRecord[] {
  const rows = db
    .prepare("SELECT * FROM schedules ORDER BY created_at_ms DESC LIMIT ?")
    .all(limit) as ScheduleRow[];
  return rows.map(mapScheduleRow);
}

export function listDueSchedules(db: DatabaseSync, nowMs: number, limit = 100): ScheduleRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM schedules
       WHERE enabled = 1 AND next_run_at_ms IS NOT NULL AND next_run_at_ms <= ?
       ORDER BY next_run_at_ms ASC
       LIMIT ?`,
    )
    .all(nowMs, limit) as ScheduleRow[];
  return rows.map(mapScheduleRow);
}

export function updateScheduleRunState(
  db: DatabaseSync,
  params: {
    scheduleId: string;
    lastRunId: string | null;
    nextRunAtMs: number | null;
    updatedAtMs: number;
  },
): void {
  db.prepare(
    `UPDATE schedules
     SET last_run_id = ?, next_run_at_ms = ?, updated_at_ms = ?
     WHERE id = ?`,
  ).run(params.lastRunId, params.nextRunAtMs, params.updatedAtMs, params.scheduleId);
}

export function deleteSchedule(db: DatabaseSync, scheduleId: string): void {
  db.prepare("DELETE FROM schedules WHERE id = ?").run(scheduleId);
}
