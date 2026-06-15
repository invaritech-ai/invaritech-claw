import type { DatabaseSync } from "node:sqlite";
import type {
  MemoryEventRecord,
  MemoryEventType,
  MemoryRecord,
  MemoryScope,
  MemoryStatus,
  MemoryType,
  MessageRecord,
  MessageRole,
  MessageStatus,
  ModelInvocationKind,
  ModelInvocationMemoryRecord,
  ModelInvocationRecord,
  ModelInvocationStatus,
  ThreadRecord,
  ThreadSummaryRecord,
} from "./schema.js";

type ThreadRow = {
  id: string;
  title: string;
  objective: string | null;
  active_model_ref: string;
  created_at_ms: number;
  updated_at_ms: number;
  archived_at_ms: number | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  role: MessageRole;
  content_text: string;
  model_ref: string | null;
  status: MessageStatus;
  created_at_ms: number;
};

type ThreadSummaryRow = {
  id: string;
  thread_id: string;
  summary_text: string;
  covered_through_message_id: string | null;
  source_summary_id: string | null;
  created_at_ms: number;
};

type MemoryRow = {
  id: string;
  scope: MemoryScope;
  thread_id: string | null;
  type: MemoryType;
  content_text: string;
  tags_json: string;
  importance: number;
  confidence: number;
  status: MemoryStatus;
  supersedes_memory_id: string | null;
  created_from_message_id: string | null;
  updated_from_message_id: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};

type MemoryEventRow = {
  id: number;
  memory_id: string;
  event_type: MemoryEventType;
  payload_json: string;
  created_at_ms: number;
};

type ModelInvocationMemoryRow = {
  invocation_id: string;
  memory_id: string;
  rank: number;
  score: number | null;
};

export type ThreadPatch = {
  id: string;
  title?: string;
  objective?: string | null;
  activeModelRef?: string;
  updatedAtMs?: number;
  archivedAtMs?: number | null;
};

export type MemoryPatch = {
  id: string;
  scope?: MemoryScope;
  threadId?: string | null;
  type?: MemoryType;
  contentText?: string;
  tagsJson?: string;
  importance?: number;
  confidence?: number;
  status?: MemoryStatus;
  supersedesMemoryId?: string | null;
  createdFromMessageId?: string | null;
  updatedFromMessageId?: string | null;
  updatedAtMs?: number;
};

export type MemorySearchInput = {
  query: string;
  scope: "thread" | "global" | "thread_and_global";
  threadId?: string;
  limit?: number;
};

export type MemoryPrefixInput = {
  prefix: string;
  threadId?: string;
  limit?: number;
};

export type ModelInvocationPatch = {
  id: string;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  modelRef?: string;
  kind?: ModelInvocationKind;
  status?: ModelInvocationStatus;
  errorJson?: string | null;
  finishedAtMs?: number | null;
};

export type NewMemoryEventRecord = Omit<MemoryEventRecord, "id">;

function mapThreadRow(row: ThreadRow): ThreadRecord {
  return {
    id: row.id,
    title: row.title,
    objective: row.objective,
    activeModelRef: row.active_model_ref,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
    archivedAtMs: row.archived_at_ms,
  };
}

function mapMessageRow(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    contentText: row.content_text,
    modelRef: row.model_ref,
    status: row.status,
    createdAtMs: row.created_at_ms,
  };
}

function mapThreadSummaryRow(row: ThreadSummaryRow): ThreadSummaryRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    summaryText: row.summary_text,
    coveredThroughMessageId: row.covered_through_message_id,
    sourceSummaryId: row.source_summary_id,
    createdAtMs: row.created_at_ms,
  };
}

function mapMemoryRow(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    scope: row.scope,
    threadId: row.thread_id,
    type: row.type,
    contentText: row.content_text,
    tagsJson: row.tags_json,
    importance: row.importance,
    confidence: row.confidence,
    status: row.status,
    supersedesMemoryId: row.supersedes_memory_id,
    createdFromMessageId: row.created_from_message_id,
    updatedFromMessageId: row.updated_from_message_id,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

function mapMemoryEventRow(row: MemoryEventRow): MemoryEventRecord {
  return {
    id: row.id,
    memoryId: row.memory_id,
    eventType: row.event_type,
    payloadJson: row.payload_json,
    createdAtMs: row.created_at_ms,
  };
}

function mapModelInvocationMemoryRow(row: ModelInvocationMemoryRow): ModelInvocationMemoryRecord {
  return {
    invocationId: row.invocation_id,
    memoryId: row.memory_id,
    rank: row.rank,
    score: row.score,
  };
}

function tagsTextFromJson(tagsJson: string): string {
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === "string").join(" ");
    }
  } catch {
    return tagsJson;
  }
  return tagsJson;
}

function syncMemoryFts(db: DatabaseSync, memory: MemoryRecord): void {
  db.prepare("DELETE FROM memories_fts WHERE memory_id = ?").run(memory.id);

  if (memory.status !== "active") {
    return;
  }

  db.prepare("INSERT INTO memories_fts (content_text, tags_text, memory_id) VALUES (?, ?, ?)").run(
    memory.contentText,
    tagsTextFromJson(memory.tagsJson),
    memory.id,
  );
}

function sanitizeFtsQuery(query: string): string | undefined {
  const tokens = query.match(/[A-Za-z0-9_]+/g);
  if (!tokens || tokens.length === 0) {
    return undefined;
  }
  return tokens.map((token) => `${token}*`).join(" OR ");
}

export function insertThread(db: DatabaseSync, record: ThreadRecord): void {
  db.prepare(
    `INSERT INTO threads (
      id, title, objective, active_model_ref, created_at_ms, updated_at_ms, archived_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.title,
    record.objective,
    record.activeModelRef,
    record.createdAtMs,
    record.updatedAtMs,
    record.archivedAtMs,
  );
}

export function updateThread(db: DatabaseSync, patch: ThreadPatch): void {
  db.prepare(
    `UPDATE threads
     SET title = CASE WHEN ? THEN ? ELSE title END,
         objective = CASE WHEN ? THEN ? ELSE objective END,
         active_model_ref = CASE WHEN ? THEN ? ELSE active_model_ref END,
         updated_at_ms = CASE WHEN ? THEN ? ELSE updated_at_ms END,
         archived_at_ms = CASE WHEN ? THEN ? ELSE archived_at_ms END
     WHERE id = ?`,
  ).run(
    patch.title !== undefined ? 1 : 0,
    patch.title ?? null,
    patch.objective !== undefined ? 1 : 0,
    patch.objective ?? null,
    patch.activeModelRef !== undefined ? 1 : 0,
    patch.activeModelRef ?? null,
    patch.updatedAtMs !== undefined ? 1 : 0,
    patch.updatedAtMs ?? null,
    patch.archivedAtMs !== undefined ? 1 : 0,
    patch.archivedAtMs ?? null,
    patch.id,
  );
}

export function getThreadById(db: DatabaseSync, threadId: string): ThreadRecord | undefined {
  const row = db.prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as
    | ThreadRow
    | undefined;
  return row ? mapThreadRow(row) : undefined;
}

export function listActiveThreads(db: DatabaseSync, limit = 100): ThreadRecord[] {
  const rows = db
    .prepare(
      "SELECT * FROM threads WHERE archived_at_ms IS NULL ORDER BY updated_at_ms DESC LIMIT ?",
    )
    .all(limit) as ThreadRow[];
  return rows.map(mapThreadRow);
}

export function insertMessage(db: DatabaseSync, record: MessageRecord): void {
  db.prepare(
    `INSERT INTO messages (
      id, thread_id, role, content_text, model_ref, status, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.threadId,
    record.role,
    record.contentText,
    record.modelRef,
    record.status,
    record.createdAtMs,
  );
}

export function listMessagesByThread(
  db: DatabaseSync,
  threadId: string,
  limit = 100,
): MessageRecord[] {
  const rows = db
    .prepare(
      "SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at_ms ASC, rowid ASC LIMIT ?",
    )
    .all(threadId, limit) as MessageRow[];
  return rows.map(mapMessageRow);
}

export function insertThreadSummary(db: DatabaseSync, record: ThreadSummaryRecord): void {
  db.prepare(
    `INSERT INTO thread_summaries (
      id, thread_id, summary_text, covered_through_message_id, source_summary_id, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.threadId,
    record.summaryText,
    record.coveredThroughMessageId,
    record.sourceSummaryId,
    record.createdAtMs,
  );
}

export function getLatestThreadSummary(
  db: DatabaseSync,
  threadId: string,
): ThreadSummaryRecord | undefined {
  const row = db
    .prepare(
      "SELECT * FROM thread_summaries WHERE thread_id = ? ORDER BY created_at_ms DESC, id DESC LIMIT 1",
    )
    .get(threadId) as ThreadSummaryRow | undefined;
  return row ? mapThreadSummaryRow(row) : undefined;
}

export function insertMemory(db: DatabaseSync, record: MemoryRecord): void {
  db.prepare(
    `INSERT INTO memories (
      id, scope, thread_id, type, content_text, tags_json, importance, confidence, status,
      supersedes_memory_id, created_from_message_id, updated_from_message_id,
      created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.scope,
    record.threadId,
    record.type,
    record.contentText,
    record.tagsJson,
    record.importance,
    record.confidence,
    record.status,
    record.supersedesMemoryId,
    record.createdFromMessageId,
    record.updatedFromMessageId,
    record.createdAtMs,
    record.updatedAtMs,
  );
  syncMemoryFts(db, record);
}

export function updateMemory(db: DatabaseSync, patch: MemoryPatch): void {
  db.prepare(
    `UPDATE memories
     SET scope = CASE WHEN ? THEN ? ELSE scope END,
         thread_id = CASE WHEN ? THEN ? ELSE thread_id END,
         type = CASE WHEN ? THEN ? ELSE type END,
         content_text = CASE WHEN ? THEN ? ELSE content_text END,
         tags_json = CASE WHEN ? THEN ? ELSE tags_json END,
         importance = CASE WHEN ? THEN ? ELSE importance END,
         confidence = CASE WHEN ? THEN ? ELSE confidence END,
         status = CASE WHEN ? THEN ? ELSE status END,
         supersedes_memory_id = CASE WHEN ? THEN ? ELSE supersedes_memory_id END,
         created_from_message_id = CASE WHEN ? THEN ? ELSE created_from_message_id END,
         updated_from_message_id = CASE WHEN ? THEN ? ELSE updated_from_message_id END,
         updated_at_ms = CASE WHEN ? THEN ? ELSE updated_at_ms END
     WHERE id = ?`,
  ).run(
    patch.scope !== undefined ? 1 : 0,
    patch.scope ?? null,
    patch.threadId !== undefined ? 1 : 0,
    patch.threadId ?? null,
    patch.type !== undefined ? 1 : 0,
    patch.type ?? null,
    patch.contentText !== undefined ? 1 : 0,
    patch.contentText ?? null,
    patch.tagsJson !== undefined ? 1 : 0,
    patch.tagsJson ?? null,
    patch.importance !== undefined ? 1 : 0,
    patch.importance ?? null,
    patch.confidence !== undefined ? 1 : 0,
    patch.confidence ?? null,
    patch.status !== undefined ? 1 : 0,
    patch.status ?? null,
    patch.supersedesMemoryId !== undefined ? 1 : 0,
    patch.supersedesMemoryId ?? null,
    patch.createdFromMessageId !== undefined ? 1 : 0,
    patch.createdFromMessageId ?? null,
    patch.updatedFromMessageId !== undefined ? 1 : 0,
    patch.updatedFromMessageId ?? null,
    patch.updatedAtMs !== undefined ? 1 : 0,
    patch.updatedAtMs ?? null,
    patch.id,
  );

  const updated = getMemoryById(db, patch.id);
  if (updated) {
    syncMemoryFts(db, updated);
  }
}

export function getMemoryById(db: DatabaseSync, memoryId: string): MemoryRecord | undefined {
  const row = db.prepare("SELECT * FROM memories WHERE id = ?").get(memoryId) as
    | MemoryRow
    | undefined;
  return row ? mapMemoryRow(row) : undefined;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function listActiveMemoriesByIdPrefix(
  db: DatabaseSync,
  input: MemoryPrefixInput,
): MemoryRecord[] {
  const prefix = escapeLike(input.prefix);
  const limit = input.limit ?? 20;

  if (input.threadId) {
    const rows = db
      .prepare(
        `SELECT *
         FROM memories
         WHERE id LIKE ? ESCAPE '\\'
           AND status = 'active'
           AND (
             (scope = 'thread' AND thread_id = ?)
             OR scope = 'global'
           )
         ORDER BY updated_at_ms DESC, id ASC
         LIMIT ?`,
      )
      .all(`${prefix}%`, input.threadId, limit) as MemoryRow[];
    return rows.map(mapMemoryRow);
  }

  const rows = db
    .prepare(
      `SELECT *
       FROM memories
       WHERE id LIKE ? ESCAPE '\\'
         AND status = 'active'
         AND scope = 'global'
       ORDER BY updated_at_ms DESC, id ASC
       LIMIT ?`,
    )
    .all(`${prefix}%`, limit) as MemoryRow[];
  return rows.map(mapMemoryRow);
}

export function searchMemories(db: DatabaseSync, input: MemorySearchInput): MemoryRecord[] {
  const ftsQuery = sanitizeFtsQuery(input.query);
  if (!ftsQuery) {
    return [];
  }

  const limit = input.limit ?? 20;
  if (input.scope === "global") {
    const rows = db
      .prepare(
        `SELECT memories.*
         FROM memories_fts
         JOIN memories ON memories.id = memories_fts.memory_id
         WHERE memories_fts MATCH ?
           AND memories.status = 'active'
           AND memories.scope = 'global'
         ORDER BY bm25(memories_fts) ASC, memories.updated_at_ms DESC
         LIMIT ?`,
      )
      .all(ftsQuery, limit) as MemoryRow[];
    return rows.map(mapMemoryRow);
  }

  if (!input.threadId) {
    return [];
  }

  if (input.scope === "thread") {
    const rows = db
      .prepare(
        `SELECT memories.*
         FROM memories_fts
         JOIN memories ON memories.id = memories_fts.memory_id
         WHERE memories_fts MATCH ?
           AND memories.status = 'active'
           AND memories.scope = 'thread'
           AND memories.thread_id = ?
         ORDER BY bm25(memories_fts) ASC, memories.updated_at_ms DESC
         LIMIT ?`,
      )
      .all(ftsQuery, input.threadId, limit) as MemoryRow[];
    return rows.map(mapMemoryRow);
  }

  const rows = db
    .prepare(
      `SELECT memories.*
       FROM memories_fts
       JOIN memories ON memories.id = memories_fts.memory_id
       WHERE memories_fts MATCH ?
         AND memories.status = 'active'
         AND (
           (memories.scope = 'thread' AND memories.thread_id = ?)
           OR memories.scope = 'global'
         )
       ORDER BY bm25(memories_fts) ASC, memories.updated_at_ms DESC
       LIMIT ?`,
    )
    .all(ftsQuery, input.threadId, limit) as MemoryRow[];
  return rows.map(mapMemoryRow);
}

export function insertMemoryEvent(
  db: DatabaseSync,
  record: NewMemoryEventRecord,
): MemoryEventRecord {
  db.prepare(
    `INSERT INTO memory_events (memory_id, event_type, payload_json, created_at_ms)
     VALUES (?, ?, ?, ?)`,
  ).run(record.memoryId, record.eventType, record.payloadJson, record.createdAtMs);

  const row = db
    .prepare("SELECT * FROM memory_events WHERE id = last_insert_rowid()")
    .get() as MemoryEventRow;
  return mapMemoryEventRow(row);
}

export function insertModelInvocation(db: DatabaseSync, record: ModelInvocationRecord): void {
  db.prepare(
    `INSERT INTO model_invocations (
      id, thread_id, user_message_id, assistant_message_id, model_ref, kind, status,
      error_json, created_at_ms, finished_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.threadId,
    record.userMessageId,
    record.assistantMessageId,
    record.modelRef,
    record.kind,
    record.status,
    record.errorJson,
    record.createdAtMs,
    record.finishedAtMs,
  );
}

export function updateModelInvocation(db: DatabaseSync, patch: ModelInvocationPatch): void {
  db.prepare(
    `UPDATE model_invocations
     SET user_message_id = CASE WHEN ? THEN ? ELSE user_message_id END,
         assistant_message_id = CASE WHEN ? THEN ? ELSE assistant_message_id END,
         model_ref = CASE WHEN ? THEN ? ELSE model_ref END,
         kind = CASE WHEN ? THEN ? ELSE kind END,
         status = CASE WHEN ? THEN ? ELSE status END,
         error_json = CASE WHEN ? THEN ? ELSE error_json END,
         finished_at_ms = CASE WHEN ? THEN ? ELSE finished_at_ms END
     WHERE id = ?`,
  ).run(
    patch.userMessageId !== undefined ? 1 : 0,
    patch.userMessageId ?? null,
    patch.assistantMessageId !== undefined ? 1 : 0,
    patch.assistantMessageId ?? null,
    patch.modelRef !== undefined ? 1 : 0,
    patch.modelRef ?? null,
    patch.kind !== undefined ? 1 : 0,
    patch.kind ?? null,
    patch.status !== undefined ? 1 : 0,
    patch.status ?? null,
    patch.errorJson !== undefined ? 1 : 0,
    patch.errorJson ?? null,
    patch.finishedAtMs !== undefined ? 1 : 0,
    patch.finishedAtMs ?? null,
    patch.id,
  );
}

export function insertModelInvocationMemory(
  db: DatabaseSync,
  record: ModelInvocationMemoryRecord,
): void {
  db.prepare(
    `INSERT INTO model_invocation_memories (invocation_id, memory_id, rank, score)
     VALUES (?, ?, ?, ?)`,
  ).run(record.invocationId, record.memoryId, record.rank, record.score);
}

export function listInvocationMemories(
  db: DatabaseSync,
  invocationId: string,
): ModelInvocationMemoryRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM model_invocation_memories
       WHERE invocation_id = ?
       ORDER BY rank ASC, memory_id ASC`,
    )
    .all(invocationId) as ModelInvocationMemoryRow[];
  return rows.map(mapModelInvocationMemoryRow);
}

export function listLatestThreadInvocationMemories(
  db: DatabaseSync,
  threadId: string,
): Array<{ invocationMemory: ModelInvocationMemoryRecord; memory: MemoryRecord }> {
  const invocation = db
    .prepare(
      `SELECT id
       FROM model_invocations
       WHERE thread_id = ?
         AND kind = 'chat'
         AND status = 'succeeded'
         AND assistant_message_id IS NOT NULL
       ORDER BY finished_at_ms DESC, created_at_ms DESC, id DESC
       LIMIT 1`,
    )
    .get(threadId) as { id: string } | undefined;

  if (!invocation) {
    return [];
  }

  const rows = db
    .prepare(
      `SELECT
         model_invocation_memories.invocation_id,
         model_invocation_memories.memory_id,
         model_invocation_memories.rank,
         model_invocation_memories.score,
         memories.*
       FROM model_invocation_memories
       JOIN memories ON memories.id = model_invocation_memories.memory_id
       WHERE model_invocation_memories.invocation_id = ?
       ORDER BY model_invocation_memories.rank ASC, model_invocation_memories.memory_id ASC`,
    )
    .all(invocation.id) as Array<ModelInvocationMemoryRow & MemoryRow>;

  return rows.map((row) => ({
    invocationMemory: mapModelInvocationMemoryRow(row),
    memory: mapMemoryRow(row),
  }));
}
