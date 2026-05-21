import type { DatabaseSync } from "node:sqlite";
import type { ApprovalRecord, ApprovalStatus } from "./schema.js";

type ApprovalRow = {
  id: string;
  run_id: string;
  status: ApprovalStatus;
  request_json: string;
  decision_json: string | null;
  expires_at_ms: number;
  created_at_ms: number;
  decided_at_ms: number | null;
};

function mapApprovalRow(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    runId: row.run_id,
    status: row.status,
    requestJson: row.request_json,
    decisionJson: row.decision_json,
    expiresAtMs: row.expires_at_ms,
    createdAtMs: row.created_at_ms,
    decidedAtMs: row.decided_at_ms,
  };
}

export function insertApproval(db: DatabaseSync, approval: ApprovalRecord): void {
  db.prepare(
    `INSERT INTO approvals (
      id, run_id, status, request_json, decision_json, expires_at_ms, created_at_ms, decided_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    approval.id,
    approval.runId,
    approval.status,
    approval.requestJson,
    approval.decisionJson,
    approval.expiresAtMs,
    approval.createdAtMs,
    approval.decidedAtMs,
  );
}

export function getApprovalById(db: DatabaseSync, approvalId: string): ApprovalRecord | undefined {
  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(approvalId) as
    | ApprovalRow
    | undefined;
  return row ? mapApprovalRow(row) : undefined;
}

export function getPendingApprovalByRunId(
  db: DatabaseSync,
  runId: string,
): ApprovalRecord | undefined {
  const row = db
    .prepare("SELECT * FROM approvals WHERE run_id = ? AND status = 'pending' LIMIT 1")
    .get(runId) as ApprovalRow | undefined;
  return row ? mapApprovalRow(row) : undefined;
}

export function decideApproval(
  db: DatabaseSync,
  params: {
    approvalId: string;
    status: Extract<ApprovalStatus, "approved" | "rejected" | "expired">;
    decisionJson: string | null;
    decidedAtMs: number;
  },
): void {
  db.prepare(
    `UPDATE approvals
     SET status = ?, decision_json = ?, decided_at_ms = ?
     WHERE id = ?`,
  ).run(params.status, params.decisionJson, params.decidedAtMs, params.approvalId);
}
