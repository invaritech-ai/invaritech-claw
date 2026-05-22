import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { decideApproval, getApprovalById, insertApproval } from "../storage/approvals.js";
import type { ApprovalStatus } from "../storage/schema.js";

type ApprovalRecordView = {
  id: string;
  runId: string;
  status: ApprovalStatus;
  request: unknown;
  decision: unknown | null;
  expiresAtMs: number;
  createdAtMs: number;
  decidedAtMs: number | null;
};

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

function mapApproval(record: ReturnType<typeof getApprovalById>): ApprovalRecordView | undefined {
  if (!record) {
    return undefined;
  }
  return {
    id: record.id,
    runId: record.runId,
    status: record.status,
    request: deserializeJson(record.requestJson),
    decision: deserializeJson(record.decisionJson),
    expiresAtMs: record.expiresAtMs,
    createdAtMs: record.createdAtMs,
    decidedAtMs: record.decidedAtMs,
  };
}

export type ApprovalService = ReturnType<typeof createApprovalService>;

export function createApprovalService(db: DatabaseSync) {
  return {
    createPendingApproval(input: {
      runId: string;
      request: unknown;
      expiresAtMs?: number;
      createdAtMs?: number;
    }): ApprovalRecordView {
      const createdAtMs = input.createdAtMs ?? Date.now();
      const expiresAtMs = input.expiresAtMs ?? createdAtMs + 5 * 60 * 1000;
      const record = {
        id: crypto.randomUUID(),
        runId: input.runId,
        status: "pending" as const,
        requestJson: serializeJson(input.request),
        decisionJson: null,
        expiresAtMs,
        createdAtMs,
        decidedAtMs: null,
      };
      insertApproval(db, record);
      return mapApproval(record)!;
    },

    getApproval(approvalId: string): ApprovalRecordView | undefined {
      return mapApproval(getApprovalById(db, approvalId));
    },

    approve(
      approvalId: string,
      decision: unknown = { approved: true },
    ): ApprovalRecordView | undefined {
      const current = getApprovalById(db, approvalId);
      if (!current) {
        return undefined;
      }
      decideApproval(db, {
        approvalId,
        status: "approved",
        decisionJson: serializeJson(decision),
        decidedAtMs: Date.now(),
      });
      return mapApproval(getApprovalById(db, approvalId));
    },

    reject(
      approvalId: string,
      decision: unknown = { approved: false },
    ): ApprovalRecordView | undefined {
      const current = getApprovalById(db, approvalId);
      if (!current) {
        return undefined;
      }
      decideApproval(db, {
        approvalId,
        status: "rejected",
        decisionJson: serializeJson(decision),
        decidedAtMs: Date.now(),
      });
      return mapApproval(getApprovalById(db, approvalId));
    },
  };
}
