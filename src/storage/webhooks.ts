import type { DatabaseSync } from "node:sqlite";
import type { WebhookDeliveryRecord, WebhookRecord } from "./schema.js";

type WebhookRow = {
  id: string;
  path: string;
  agent_id: string;
  config_json: string;
  created_at_ms: number;
  updated_at_ms: number;
};

type WebhookDeliveryRow = {
  id: string;
  webhook_id: string;
  idempotency_key: string | null;
  run_id: string | null;
  request_json: string;
  response_json: string | null;
  status: string;
  created_at_ms: number;
};

function mapWebhookRow(row: WebhookRow): WebhookRecord {
  return {
    id: row.id,
    path: row.path,
    agentId: row.agent_id,
    configJson: row.config_json,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

function mapWebhookDeliveryRow(row: WebhookDeliveryRow): WebhookDeliveryRecord {
  return {
    id: row.id,
    webhookId: row.webhook_id,
    idempotencyKey: row.idempotency_key,
    runId: row.run_id,
    requestJson: row.request_json,
    responseJson: row.response_json,
    status: row.status,
    createdAtMs: row.created_at_ms,
  };
}

export function upsertWebhook(db: DatabaseSync, webhook: WebhookRecord): void {
  db.prepare(
    `INSERT INTO webhooks (
      id, path, agent_id, config_json, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      path = excluded.path,
      agent_id = excluded.agent_id,
      config_json = excluded.config_json,
      updated_at_ms = excluded.updated_at_ms`,
  ).run(
    webhook.id,
    webhook.path,
    webhook.agentId,
    webhook.configJson,
    webhook.createdAtMs,
    webhook.updatedAtMs,
  );
}

export function getWebhookById(db: DatabaseSync, webhookId: string): WebhookRecord | undefined {
  const row = db.prepare("SELECT * FROM webhooks WHERE id = ?").get(webhookId) as
    | WebhookRow
    | undefined;
  return row ? mapWebhookRow(row) : undefined;
}

export function listWebhooks(db: DatabaseSync, limit = 100): WebhookRecord[] {
  const rows = db
    .prepare("SELECT * FROM webhooks ORDER BY created_at_ms DESC LIMIT ?")
    .all(limit) as WebhookRow[];
  return rows.map(mapWebhookRow);
}

export function getWebhookByPath(db: DatabaseSync, webhookPath: string): WebhookRecord | undefined {
  const row = db.prepare("SELECT * FROM webhooks WHERE path = ?").get(webhookPath) as
    | WebhookRow
    | undefined;
  return row ? mapWebhookRow(row) : undefined;
}

export function insertWebhookDelivery(db: DatabaseSync, delivery: WebhookDeliveryRecord): void {
  db.prepare(
    `INSERT INTO webhook_deliveries (
      id, webhook_id, idempotency_key, run_id, request_json, response_json, status, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    delivery.id,
    delivery.webhookId,
    delivery.idempotencyKey,
    delivery.runId,
    delivery.requestJson,
    delivery.responseJson,
    delivery.status,
    delivery.createdAtMs,
  );
}

export function getWebhookDeliveryById(
  db: DatabaseSync,
  deliveryId: string,
): WebhookDeliveryRecord | undefined {
  const row = db.prepare("SELECT * FROM webhook_deliveries WHERE id = ?").get(deliveryId) as
    | WebhookDeliveryRow
    | undefined;
  return row ? mapWebhookDeliveryRow(row) : undefined;
}

export function getWebhookDeliveryByIdempotencyKey(
  db: DatabaseSync,
  webhookId: string,
  idempotencyKey: string,
): WebhookDeliveryRecord | undefined {
  const row = db
    .prepare("SELECT * FROM webhook_deliveries WHERE webhook_id = ? AND idempotency_key = ?")
    .get(webhookId, idempotencyKey) as WebhookDeliveryRow | undefined;
  return row ? mapWebhookDeliveryRow(row) : undefined;
}
