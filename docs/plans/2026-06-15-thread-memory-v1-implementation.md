# Thread Memory V1 Milestone A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal run loop with a thread-first TUI assistant that persists conversations, supports manual model switching, manual memory, FTS memory retrieval, context reconstruction, and manual compaction.

**Architecture:** Public product concepts become threads, messages, memories, summaries, and model invocations. The server exposes thread APIs; the TUI is a line-based operator shell backed by an API client and command parser. Memory and compaction are synchronous/manual in Milestone A, with tables and boundaries ready for Milestone B background workers.

**Tech Stack:** Node 22+, TypeScript ESM, Express, SQLite via `node:sqlite`, JSON5 config, Vitest, Ollama/OpenRouter providers.

---

## Current Baseline

The repo currently has a minimal run-based skeleton:

- `src/runs/*`
- `src/storage/runs.ts`
- `src/server/routes/runs.ts`
- `src/tui/operator-api.ts`
- `src/tui/operator-console.ts`
- `src/tui/interactive.ts`

Milestone A replaces this public surface. Do not add a compatibility bridge for `/runs`.

## Target File Map

Create:

- `src/threads/types.ts`: thread, message, summary, memory, context, invocation domain types.
- `src/storage/threads.ts`: SQLite repository functions for threads/messages/summaries/memories/invocations.
- `src/threads/service.ts`: business service for threads, messages, memory CRUD/search, summary storage, invocation lifecycle.
- `src/threads/context.ts`: context reconstruction and percentage budget handling.
- `src/threads/compact.ts`: compaction prompt builder and provider call orchestration.
- `src/server/routes/threads.ts`: HTTP API for thread/message/model/memory/context/compaction endpoints.
- `src/tui/commands.ts`: slash command parser and command result types.
- `test/threads/threads.test.ts`
- `test/threads/context.test.ts`
- `test/threads/compact.test.ts`
- `test/server/threads-api.test.ts`
- `test/tui/commands.test.ts`

Modify:

- `src/storage/migrations.ts`: replace run tables with thread/memory schema and FTS virtual table.
- `src/storage/schema.ts`: replace run record types with thread/memory records.
- `src/storage/sqlite.ts`: keep migration entry only; no behavioral change expected.
- `src/agent/types.ts`: add `complete()` provider input/result types.
- `src/providers/ollama/index.ts`: implement `complete()`.
- `src/providers/openrouter/index.ts`: implement `complete()`.
- `src/server/providers.ts`: expose listable provider registry.
- `src/server/app.ts`: create thread service and attach thread routes.
- `src/tui/operator-api.ts`: replace run methods with thread/model/memory/context methods.
- `src/tui/operator-console.ts`: implement thread-first command handlers.
- `src/tui/interactive.ts`: open/create active thread and route prompts through thread messages.
- `src/cli/main.ts`: add `init`, update help, keep `server` and `tui`.
- `src/config/types.ts` and `src/config/schema.ts`: add `models`, `context`, `compaction`, `memory`, `workers`.
- `src/index.ts`: export new modules, remove run exports.
- `README.md`: update quick start and commands.
- Delete `src/runs/*`, `src/storage/runs.ts`, `src/server/routes/runs.ts`, and run tests after thread replacements pass.

## Data Model

Use a hard-fork migration id such as `2026-06-15-thread-memory-v1`.

Tables:

```sql
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  objective TEXT,
  active_model_ref TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  archived_at_ms INTEGER
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content_text TEXT NOT NULL,
  model_ref TEXT,
  status TEXT NOT NULL CHECK (status IN ('complete', 'failed_partial')),
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE thread_summaries (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  covered_through_message_id TEXT,
  source_summary_id TEXT,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE memories (
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

CREATE VIRTUAL TABLE memories_fts USING fts5(content_text, tags_text, memory_id UNINDEXED);

CREATE TABLE memory_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'merged', 'rejected', 'forgotten')),
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE model_invocations (
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

CREATE TABLE model_invocation_memories (
  invocation_id TEXT NOT NULL,
  memory_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  score REAL,
  PRIMARY KEY (invocation_id, memory_id)
);

CREATE TABLE background_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  payload_json TEXT NOT NULL,
  error_json TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
```

Indexes:

```sql
CREATE INDEX idx_threads_updated ON threads(updated_at_ms DESC);
CREATE INDEX idx_messages_thread_created ON messages(thread_id, created_at_ms ASC);
CREATE INDEX idx_summaries_thread_created ON thread_summaries(thread_id, created_at_ms DESC);
CREATE INDEX idx_memories_scope_thread_status ON memories(scope, thread_id, status, updated_at_ms DESC);
CREATE INDEX idx_invocations_thread_created ON model_invocations(thread_id, created_at_ms DESC);
```

## Task 1: Storage Schema And Thread Repository

**Files:**

- Modify: `src/storage/migrations.ts`
- Modify: `src/storage/schema.ts`
- Create: `src/storage/threads.ts`
- Create: `src/threads/types.ts`
- Create/Modify: `test/storage/sqlite.test.ts`
- Create: `test/threads/threads.test.ts`

- [ ] **Step 1: Write failing storage schema tests**

Add expectations that a new database has exactly the Milestone A tables plus SQLite internals, and that `runs`/`run_events` are absent.

```ts
expect(tableNames).toEqual(
  new Set([
    "background_jobs",
    "memories",
    "memories_fts",
    "memories_fts_config",
    "memories_fts_content",
    "memories_fts_data",
    "memories_fts_docsize",
    "memory_events",
    "model_invocation_memories",
    "model_invocations",
    "messages",
    "schema_migrations",
    "thread_summaries",
    "threads",
  ]),
);
expect(tableNames.has("runs")).toBe(false);
expect(tableNames.has("run_events")).toBe(false);
```

Run:

```bash
pnpm test test/storage/sqlite.test.ts
```

Expected: fail because the current schema still creates `runs`.

- [ ] **Step 2: Write failing thread repository tests**

Create `test/threads/threads.test.ts` with tests for:

```ts
it("creates a thread and appends messages in order", () => {});
it("archives threads without deleting messages", () => {});
it("creates, searches, and forgets memories through FTS", () => {});
it("records model invocations and memories used", () => {});
```

Run:

```bash
pnpm test test/threads/threads.test.ts
```

Expected: fail because `createThreadService` does not exist.

- [ ] **Step 3: Implement schema and repository**

Replace the run migration with the data model above. Add `src/storage/threads.ts` with small repository functions:

```ts
insertThread(db, record)
updateThread(db, recordPatch)
getThreadById(db, threadId)
listActiveThreads(db, limit)
insertMessage(db, record)
listMessagesByThread(db, threadId, limit?)
insertThreadSummary(db, record)
getLatestThreadSummary(db, threadId)
insertMemory(db, record)
updateMemory(db, recordPatch)
searchMemories(db, input)
insertMemoryEvent(db, record)
insertModelInvocation(db, record)
updateModelInvocation(db, recordPatch)
insertModelInvocationMemory(db, record)
listInvocationMemories(db, invocationId)
```

Implement `src/threads/service.ts` in this task only if needed by tests; otherwise keep a minimal service wrapper in `src/threads/types.ts` and finish service behavior in Task 2.

- [ ] **Step 4: Run tests**

```bash
pnpm test test/storage/sqlite.test.ts test/threads/threads.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/storage/migrations.ts src/storage/schema.ts src/storage/threads.ts src/threads/types.ts test/storage/sqlite.test.ts test/threads/threads.test.ts
git commit -m "feat: add thread memory storage"
```

## Task 2: Thread Service, Memory Commands, And Context Reconstruction

**Files:**

- Create/Modify: `src/threads/service.ts`
- Create: `src/threads/context.ts`
- Create: `test/threads/context.test.ts`
- Modify: `src/config/types.ts`
- Modify: `src/config/schema.ts`
- Modify: `test/config/config.test.ts`

- [ ] **Step 1: Write failing service/context tests**

In `test/threads/context.test.ts`, cover:

```ts
it("creates a default main thread with configured chat model", () => {});
it("persists user messages before assistant messages", () => {});
it("retrieves thread and global memories for the current prompt", () => {});
it("builds context sections in stable order", () => {});
it("drops older recent messages before dropping current user message", () => {});
```

Run:

```bash
pnpm test test/threads/context.test.ts
```

Expected: fail because service/context modules do not exist.

- [ ] **Step 2: Extend config**

Add config types and schema defaults:

```ts
models: {
  chat: "ollama/gemma4:e4b",
  memory: "ollama/qwen3:4b",
  compaction: "ollama/gemma4:e4b",
  embedding: "ollama/mxbai-embed-large:latest",
  favorites: [],
  contextWindows: {},
}
context: {
  maxTokens: 32000,
  responseReservePercent: 15,
  memoryPercent: 15,
  summaryPercent: 20,
  recentMessagesPercent: 50,
}
compaction: {
  keepRecentMessages: 12,
}
memory: {
  curatorPromptPath?: string,
  compactionPromptPath?: string,
}
workers: {
  enabled: true,
  pollIntervalMs: 1000,
}
```

Update config tests to assert defaults and strict rejection of unknown keys.

- [ ] **Step 3: Implement thread service**

Implement service methods:

```ts
getOrCreateDefaultThread();
createThread(input);
listThreads(input);
getThread(threadId);
archiveThread(threadId);
renameThread(threadId, title);
setObjective(threadId, objective);
setThreadModel(threadId, modelRef);
appendUserMessage(threadId, text);
appendAssistantMessage(threadId, input);
remember(input);
searchMemories(input);
forgetMemory(prefixOrId);
recordInvocation(input);
finishInvocation(input);
```

Memory prefix matching must error on no match and ambiguous match.

- [ ] **Step 4: Implement context reconstruction**

`buildThreadContext(input)` returns:

```ts
{
  messages: ModelMessage[];
  usedMemories: Memory[];
  sections: {
    objective: string;
    memories: string;
    summary: string | null;
    recentMessageCount: number;
  };
  tokenEstimate: number;
}
```

Use stable prompt order:

```text
System instructions
Current objective
Relevant memories
Thread summary
Recent messages
Current user message
```

Use percentage budgets from config. Use a simple token estimate of `Math.ceil(text.length / 4)` for v1.

- [ ] **Step 5: Run tests**

```bash
pnpm test test/config/config.test.ts test/threads/context.test.ts test/threads/threads.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/config/types.ts src/config/schema.ts src/threads/service.ts src/threads/context.ts test/config/config.test.ts test/threads/context.test.ts test/threads/threads.test.ts
git commit -m "feat: add thread service and context reconstruction"
```

## Task 3: Provider Completion And Model Listing

**Files:**

- Modify: `src/agent/types.ts`
- Modify: `src/providers/ollama/index.ts`
- Modify: `src/providers/openrouter/index.ts`
- Modify: `src/server/providers.ts`
- Modify: `test/providers/ollama.test.ts`
- Modify: `test/providers/openrouter.test.ts`
- Modify: `test/server/providers.test.ts`

- [ ] **Step 1: Write failing provider tests**

Add tests:

```ts
it("ollama complete posts non-streaming chat and returns message content", async () => {});
it("openrouter complete posts non-streaming chat and returns choice message content", async () => {});
it("model listing returns qualified ollama ids and configured favorites", async () => {});
```

Run:

```bash
pnpm test test/providers/ollama.test.ts test/providers/openrouter.test.ts test/server/providers.test.ts
```

Expected: fail because `complete()` and model favorite listing are missing.

- [ ] **Step 2: Extend provider interface**

Add:

```ts
export type ModelCompleteInput = {
  model: string;
  messages: ModelMessage[];
  signal?: AbortSignal;
};

export type ModelCompleteResult = {
  text: string;
};
```

`ModelProvider` includes `complete(input): Promise<ModelCompleteResult>`.

- [ ] **Step 3: Implement provider completion**

Ollama:

```ts
POST /api/chat
{ model, messages, stream: false }
```

Return `payload.message.content`.

OpenRouter:

```ts
POST /chat/completions
{ model, messages, stream: false }
```

Return `choices[0].message.content`.

Throw clear errors for non-2xx, missing body, or missing content.

- [ ] **Step 4: Implement model list helper**

Expose a server helper that returns:

- `ollama/<id>` for provider `listModels()`
- configured `models.favorites`

Do not fetch OpenRouter catalog.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm test test/providers/ollama.test.ts test/providers/openrouter.test.ts test/server/providers.test.ts
git add src/agent/types.ts src/providers/ollama/index.ts src/providers/openrouter/index.ts src/server/providers.ts test/providers/ollama.test.ts test/providers/openrouter.test.ts test/server/providers.test.ts
git commit -m "feat: add provider completion and model listing"
```

## Task 4: Thread HTTP API

**Files:**

- Create: `src/server/routes/threads.ts`
- Modify: `src/server/app.ts`
- Delete: `src/server/routes/runs.ts`
- Delete: `src/runs/*`
- Delete: `src/storage/runs.ts`
- Modify: `src/index.ts`
- Create: `test/server/threads-api.test.ts`
- Delete: `test/server/runs-api.test.ts`
- Delete: `test/runs/runs.test.ts`
- Delete: `test/agent/execute.test.ts` if no longer relevant, or replace with thread execution coverage.

- [ ] **Step 1: Write failing API tests**

Cover:

```ts
it("creates and lists threads", async () => {});
it("posts a user message and returns assistant response", async () => {});
it("persists model override per thread", async () => {});
it("creates, searches, and forgets memories", async () => {});
it("returns context preview and memories used for the latest response", async () => {});
it("compacts a thread using the configured compaction model", async () => {});
it("does not expose /runs", async () => {});
```

Run:

```bash
pnpm test test/server/threads-api.test.ts
```

Expected: fail because thread routes are missing.

- [ ] **Step 2: Implement routes**

Endpoints:

```text
GET /threads
POST /threads
GET /threads/:id
PATCH /threads/:id
POST /threads/:id/messages
GET /threads/:id/messages
POST /threads/:id/model
GET /models
POST /threads/:id/memories
GET /threads/:id/memories
POST /threads/:id/memories/:memoryIdPrefix/forget
GET /threads/:id/context
GET /threads/:id/memory-used
POST /threads/:id/compact
GET /threads/:id/summary
```

`POST /threads/:id/messages` flow:

1. Persist user message.
2. Build context.
3. Create chat model invocation.
4. Call provider stream or complete.
5. Persist final assistant message.
6. Record used memories.
7. Return assistant message plus context metadata.

For Milestone A, HTTP response can wait for completion.

- [ ] **Step 3: Remove run exports and files**

Delete run modules and update `src/index.ts` exports. No `/runs` compatibility.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test test/server/threads-api.test.ts test/threads/threads.test.ts test/threads/context.test.ts
git add -A
git commit -m "feat: replace runs API with threads"
```

## Task 5: TUI Command Parser And Thread Shell

**Files:**

- Create: `src/tui/commands.ts`
- Modify: `src/tui/operator-api.ts`
- Modify: `src/tui/operator-console.ts`
- Modify: `src/tui/interactive.ts`
- Modify/Create: `test/tui/commands.test.ts`
- Modify: `test/tui/operator-console.test.ts`

- [ ] **Step 1: Write failing command parser tests**

Cover parsing for:

```text
/help
/new Build memory
/thread list
/thread switch abc123
/thread rename New title
/thread archive abc123
/objective Ship Milestone A
/model
/model list
/model set ollama/gemma4:e4b
/remember global User prefers manual switching.
/memory thread provider
/memory-used
/forget a8f13c
/context
/context full
/compact
/summary
/exit
```

Run:

```bash
pnpm test test/tui/commands.test.ts
```

Expected: fail because parser is missing.

- [ ] **Step 2: Replace operator API client methods**

Client methods should match the thread HTTP API. Remove run-specific methods.

- [ ] **Step 3: Implement command handling**

`runOperatorCommand` should return structured display text for each command and call the API client.

`runOperatorPrompt` should post to the active thread’s messages endpoint.

`runInteractiveOperatorConsole` should:

- create/open default thread before prompt loop
- show header with active thread and model
- print `context: summary + N recent messages + M memories` after responses when metadata is available
- support `/exit`

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test test/tui/commands.test.ts test/tui/operator-console.test.ts
git add src/tui/commands.ts src/tui/operator-api.ts src/tui/operator-console.ts src/tui/interactive.ts test/tui/commands.test.ts test/tui/operator-console.test.ts
git commit -m "feat: add thread TUI commands"
```

## Task 6: Manual Compaction

**Files:**

- Create: `src/threads/compact.ts`
- Modify: `src/threads/service.ts`
- Modify: `src/server/routes/threads.ts`
- Create: `test/threads/compact.test.ts`
- Modify: `test/server/threads-api.test.ts`

- [ ] **Step 1: Write failing compaction tests**

Cover:

```ts
it("builds compaction prompt with previous summary and uncovered messages", async () => {});
it("keeps the last 12 messages raw by default", async () => {});
it("stores a new summary with coveredThroughMessageId", async () => {});
it("does not compact when provider complete fails", async () => {});
```

Run:

```bash
pnpm test test/threads/compact.test.ts
```

Expected: fail because compaction module is missing.

- [ ] **Step 2: Implement compaction**

Use `models.compaction || models.chat`.

Prompt must preserve:

- objective
- decisions
- constraints
- open questions
- current status
- identifiers exactly

Keep the latest `compaction.keepRecentMessages` messages uncovered.

- [ ] **Step 3: Wire API and TUI**

`POST /threads/:id/compact` triggers compaction.

`/compact` calls the endpoint.

`/summary` displays latest summary.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test test/threads/compact.test.ts test/server/threads-api.test.ts test/tui/operator-console.test.ts
git add src/threads/compact.ts src/threads/service.ts src/server/routes/threads.ts test/threads/compact.test.ts test/server/threads-api.test.ts test/tui/operator-console.test.ts
git commit -m "feat: add manual thread compaction"
```

## Task 7: Config Init And Local Security

**Files:**

- Modify: `src/cli/main.ts`
- Create: `src/cli/init.ts`
- Modify: `src/server/app.ts`
- Modify: `src/tui/operator-api.ts`
- Create/Modify: `test/config/config.test.ts`
- Create: `test/cli/init.test.ts`
- Create/Modify: `test/server/threads-api.test.ts`

- [ ] **Step 1: Write failing init tests**

Cover:

```ts
it("writes smart ollama defaults from /api/tags", async () => {});
it("falls back to static local defaults when ollama is unavailable", async () => {});
it("includes openrouter only when OPENROUTER_API_KEY exists", async () => {});
it("does not overwrite config unless force is true", async () => {});
```

Run:

```bash
pnpm test test/cli/init.test.ts
```

Expected: fail because `init` is missing.

- [ ] **Step 2: Implement init**

`iclaw init` writes `~/.iclaw/iclaw.json` or `ICLAW_CONFIG_PATH`.

Preferred model choices:

```text
chat/compaction: gemma4:e4b -> phi4:latest -> mistral:latest -> llama3.2:latest
memory: qwen3:4b -> granite4:latest -> llama3.2:latest -> qwen3:0.6b
embedding: mxbai-embed-large:latest
```

Include OpenRouter provider only if `OPENROUTER_API_KEY` exists.

- [ ] **Step 3: Implement loopback/token behavior**

Default no token on `127.0.0.1`.

If host is not loopback, require `server.apiToken`.

If `server.apiToken` is configured, require:

```text
Authorization: Bearer <token>
```

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test test/cli/init.test.ts test/server/threads-api.test.ts test/config/config.test.ts
git add src/cli/main.ts src/cli/init.ts src/server/app.ts src/tui/operator-api.ts test/cli/init.test.ts test/server/threads-api.test.ts test/config/config.test.ts
git commit -m "feat: add iclaw init and local API guard"
```

## Task 8: Cleanup, Docs, And Gates

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md` if commands changed.
- Modify: `src/index.ts`
- Delete any remaining run-based files/tests.

- [ ] **Step 1: Scan for stale concepts**

Run:

```bash
rg -n "run|runs|Run|Runs|/runs|approval|webhook|schedule|tool_call|openclaw|OpenClaw|@openclaw|\\.openclaw" -g '!node_modules/**' .
```

Expected:

- no OpenClaw strings
- no public `/runs`
- `run` only appears in generic command text such as `run tests` or if intentionally retained as "runtime"; otherwise remove it

- [ ] **Step 2: Update README**

README must show:

```bash
pnpm iclaw init
pnpm iclaw server
pnpm iclaw tui
```

And commands:

```text
/help
/new
/thread list
/model list
/remember
/memory
/context
/compact
/summary
```

- [ ] **Step 3: Run full gates**

Run:

```bash
pnpm build
pnpm test
pnpm check:changed
pnpm lint
pnpm format:check
```

Expected: all pass.

- [ ] **Step 4: Manual smoke**

With Ollama running:

```bash
pnpm iclaw init --force
pnpm iclaw server --port 47825
pnpm iclaw tui --base-url http://127.0.0.1:47825
```

Smoke commands:

```text
/help
/thread list
/model list
/remember thread Manual memory works.
/memory Manual
hello
/context
/memory-used
/compact
/summary
/exit
```

Expected:

- thread persists
- assistant responds
- memory is retrievable
- context preview shows memory count
- compaction writes summary

- [ ] **Step 5: Commit final cleanup**

```bash
git add -A
git commit -m "docs: update thread memory usage"
```
