import type { DatabaseSync } from "node:sqlite";

const V1_MIGRATION_ID = "2026-05-29-minimal-runs";

type MigrationDefinition = {
  id: string;
  sql: string;
};

const MIGRATIONS: MigrationDefinition[] = [
  {
    id: V1_MIGRATION_ID,
    sql: `
CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at_ms INTEGER NOT NULL);
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('tui', 'api')),
  trigger_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  input_json TEXT NOT NULL,
  result_json TEXT,
  error_json TEXT,
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

export { V1_MIGRATION_ID };
