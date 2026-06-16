import type { DatabaseSync } from "node:sqlite";

const V1_MIGRATION_ID = "2026-06-15-thread-memory-v1";

type MigrationDefinition = {
  id: string;
  sql: string;
};

const MIGRATIONS: MigrationDefinition[] = [
  {
    id: V1_MIGRATION_ID,
    sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  objective TEXT,
  active_model_ref TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  archived_at_ms INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content_text TEXT NOT NULL,
  model_ref TEXT,
  status TEXT NOT NULL CHECK (status IN ('complete', 'failed_partial')),
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS thread_summaries (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  covered_through_message_id TEXT,
  source_summary_id TEXT,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('thread', 'global')),
  thread_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('fact', 'preference', 'decision', 'constraint', 'principle', 'milestone')),
  content_text TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  importance REAL NOT NULL,
  confidence REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'forgotten')),
  supersedes_memory_id TEXT,
  created_from_message_id TEXT,
  updated_from_message_id TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(content_text, tags_text, memory_id UNINDEXED);

CREATE TABLE IF NOT EXISTS memory_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'merged', 'rejected', 'forgotten')),
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS model_invocations (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  user_message_id TEXT,
  assistant_message_id TEXT,
  model_ref TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('chat', 'compaction', 'memory')),
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  error_json TEXT,
  created_at_ms INTEGER NOT NULL,
  finished_at_ms INTEGER
);

CREATE TABLE IF NOT EXISTS model_invocation_memories (
  invocation_id TEXT NOT NULL,
  memory_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  score REAL,
  PRIMARY KEY (invocation_id, memory_id)
);

CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  payload_json TEXT NOT NULL,
  error_json TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages(thread_id, created_at_ms ASC);
CREATE INDEX IF NOT EXISTS idx_summaries_thread_created ON thread_summaries(thread_id, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_memories_scope_thread_status ON memories(scope, thread_id, status, updated_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_invocations_thread_created ON model_invocations(thread_id, created_at_ms DESC);
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
