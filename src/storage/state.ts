import type { DatabaseSync } from "node:sqlite";
import type { KvStateRecord } from "./schema.js";

type KvStateRow = {
  namespace: string;
  key: string;
  value_json: string;
  created_at_ms: number;
  updated_at_ms: number;
};

function mapKvStateRow(row: KvStateRow): KvStateRecord {
  return {
    namespace: row.namespace,
    key: row.key,
    valueJson: row.value_json,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export function setStateValue(db: DatabaseSync, entry: KvStateRecord): void {
  db.prepare(
    `INSERT INTO kv_state (namespace, key, value_json, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(namespace, key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at_ms = excluded.updated_at_ms`,
  ).run(entry.namespace, entry.key, entry.valueJson, entry.createdAtMs, entry.updatedAtMs);
}

export function getStateValue(
  db: DatabaseSync,
  namespace: string,
  key: string,
): KvStateRecord | undefined {
  const row = db
    .prepare("SELECT * FROM kv_state WHERE namespace = ? AND key = ?")
    .get(namespace, key) as KvStateRow | undefined;
  return row ? mapKvStateRow(row) : undefined;
}

export function listStateNamespace(db: DatabaseSync, namespace: string): KvStateRecord[] {
  const rows = db
    .prepare("SELECT * FROM kv_state WHERE namespace = ? ORDER BY key ASC")
    .all(namespace) as KvStateRow[];
  return rows.map(mapKvStateRow);
}

export function deleteStateValue(db: DatabaseSync, namespace: string, key: string): void {
  db.prepare("DELETE FROM kv_state WHERE namespace = ? AND key = ?").run(namespace, key);
}
