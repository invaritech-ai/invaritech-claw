import type { DatabaseSync } from "node:sqlite";

const V1_MIGRATION_ID = "2026-05-18-v1";
const V2_MIGRATION_ID = "2026-05-21-run-idempotency-trigger-id-normalize";

type MigrationDefinition = {
  id: string;
  sql: string;
};

const MIGRATIONS: MigrationDefinition[] = [
  {
    id: V1_MIGRATION_ID,
    sql: `
CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at_ms INTEGER NOT NULL);
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('tui', 'api', 'webhook', 'schedule')),
  trigger_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled')),
  input_json TEXT NOT NULL,
  result_json TEXT,
  error_json TEXT,
  approval_id TEXT,
  idempotency_key TEXT,
  created_at_ms INTEGER NOT NULL,
  started_at_ms INTEGER,
  finished_at_ms INTEGER
);
CREATE INDEX idx_runs_agent_created ON runs(agent_id, created_at_ms DESC);
CREATE INDEX idx_runs_status_created ON runs(status, created_at_ms DESC);
CREATE UNIQUE INDEX idx_runs_idempotency ON runs(trigger_type, COALESCE(trigger_id, ''), idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  UNIQUE(run_id, seq)
);
CREATE INDEX idx_run_events_run_seq ON run_events(run_id, seq);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE TABLE session_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content_json TEXT NOT NULL,
  run_id TEXT,
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_session_messages_session_created ON session_messages(session_id, created_at_ms);
CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  schedule_json TEXT NOT NULL,
  input_json TEXT NOT NULL,
  approval_mode TEXT NOT NULL CHECK (approval_mode IN ('fail', 'pause')),
  next_run_at_ms INTEGER,
  last_run_id TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_schedules_due ON schedules(enabled, next_run_at_ms);
CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  agent_id TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  idempotency_key TEXT,
  run_id TEXT,
  request_json TEXT NOT NULL,
  response_json TEXT,
  status TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  UNIQUE(webhook_id, idempotency_key)
);
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  request_json TEXT NOT NULL,
  decision_json TEXT,
  expires_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  decided_at_ms INTEGER
);
CREATE TABLE kv_state (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(namespace, key)
);
`,
  },
  {
    id: V2_MIGRATION_ID,
    sql: `
DROP INDEX IF EXISTS idx_runs_idempotency;
CREATE UNIQUE INDEX idx_runs_idempotency ON runs(trigger_type, COALESCE(trigger_id, ''), idempotency_key) WHERE idempotency_key IS NOT NULL;
`,
  },
];

function hasSchemaMigrationsTable(db: DatabaseSync): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get() as { name?: string } | undefined;
  return row?.name === "schema_migrations";
}

function getAppliedMigrationIds(db: DatabaseSync): Set<string> {
  if (!hasSchemaMigrationsTable(db)) {
    return new Set();
  }
  const rows = db.prepare("SELECT id FROM schema_migrations ORDER BY id ASC").all() as Array<{
    id: string;
  }>;
  return new Set(rows.map((row) => row.id));
}

function applyMigration(
  db: DatabaseSync,
  migration: MigrationDefinition,
  appliedAtMs: number,
): void {
  db.exec("BEGIN");
  try {
    db.exec(migration.sql);
    db.prepare("INSERT INTO schema_migrations (id, applied_at_ms) VALUES (?, ?)").run(
      migration.id,
      appliedAtMs,
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function runMigrations(db: DatabaseSync): void {
  const appliedMigrationIds = getAppliedMigrationIds(db);
  for (const migration of MIGRATIONS) {
    if (appliedMigrationIds.has(migration.id)) {
      continue;
    }
    applyMigration(db, migration, Date.now());
    appliedMigrationIds.add(migration.id);
  }
}

export { V1_MIGRATION_ID, V2_MIGRATION_ID };
