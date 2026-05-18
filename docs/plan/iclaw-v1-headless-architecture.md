# iclaw V1 Headless Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build iclaw v1 as a minimal headless API automation agent with TUI operator control, OpenRouter and Ollama providers, SQLite state, native HTTP APIs, webhooks, and one scheduler model.

**Architecture:** This is a hard fork with no compatibility promise. The v1 runtime is centered on runs: TUI, API requests, webhooks, and schedules all create or inspect runs, and runs execute against named agents with explicit tool policy. The codebase should be destructively trimmed to a pnpm-managed single package while keeping small internal extension seams for providers, APIs, tools, webhooks, and schedules.

**Tech Stack:** Node 22+, TypeScript ESM, pnpm with supply-chain guardrails, `node:sqlite`, JSON5 config, Vitest, existing TUI stack, OpenRouter, Ollama.

---

## Status

This plan supersedes older iclaw plans when they conflict with these decisions:

- `docs/superpowers/plans/2026-04-26-iclaw-hard-fork-design.md`
- `docs/superpowers/plans/2026-04-27-iclaw-deletion-bundles.md`
- `docs/superpowers/iclaw-phase-0-inventory.md`

Those files remain useful inventory, but this plan is the current product contract.

## Locked Decisions

- Hard fork. No migration helpers, no compatibility shims, no legacy state import.
- Product surface is terminal and headless only: CLI, TUI, local HTTP server.
- Destructive trim is allowed and preferred.
- Keep pnpm and its guardrails, but collapse to one npm package. No workspace packages unless a later feature earns extraction.
- Canonical state store is SQLite via `node:sqlite`.
- Config is fresh and incompatible: `~/.iclaw/iclaw.json`.
- Providers: OpenRouter and Ollama only.
- Provider discovery is minimal: OpenRouter accepts dynamic model refs, Ollama queries `/api/tags`.
- One scheduler model replaces separate heartbeat and cron concepts.
- Native iclaw HTTP API is primary. OpenAI-compatible endpoints are deferred.
- TUI is an operator console, not just chat.
- Multiple named agents are supported, with explicit routing only.
- Subagents are out of v1.
- Tools are minimal and deny by default.
- Approvals exist only as run-blocking API/TUI state.
- Unattended approvals fail closed by default.
- Docs are small Markdown docs only.
- Tests are rebuilt around the v1 surface instead of migrated wholesale.

## Product Contract

### Kept Surfaces

- CLI entrypoint: `iclaw`
- TUI operator console
- Local HTTP server
- Agent run execution
- SQLite state
- JSON5 config
- Scheduler
- Webhooks
- Native run API
- OpenRouter provider
- Ollama provider
- Minimal internal plugin seam
- Focused Markdown docs
- Focused Vitest tests

### Removed Surfaces

- Mobile apps
- Mac app
- Browser control UI
- Channel integrations
- Pairing flows
- Message delivery abstractions for external chat apps
- Broad public plugin SDK
- Broad provider catalog
- Legacy config migrations
- Legacy state migrations
- OpenAI-compatible HTTP endpoints for v1
- MCP for v1
- Browser automation for v1
- Media, voice, memory, canvas, and app device surfaces for v1
- Subagents for v1
- Docs site machinery for v1
- Release/update machinery tied to removed products

## Target Repository Shape

The target is a single pnpm-managed package.

```text
src/
  cli/
  tui/
  server/
  agent/
  runs/
  scheduler/
  webhooks/
  providers/
    openrouter/
    ollama/
  plugins/
  tools/
  approvals/
  config/
  storage/
  secrets/
  util/
test/
docs/
scripts/
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.json
```

`pnpm-workspace.yaml` can remain if it only contains `.` and keeps package-manager policy centralized:

```yaml
packages:
  - .

minimumReleaseAge: 2880

minimumReleaseAgeExclude:
  - "@mariozechner/*"
  - "@types/node"
  - "@typescript/native-preview*"
  - "@oxlint/*"
  - "@oxfmt/*"
```

## Config Contract

The v1 config file is `~/.iclaw/iclaw.json`. It is JSON5 and intentionally incompatible with earlier config.

```json5
{
  agents: {
    main: {
      model: "openrouter/anthropic/claude-sonnet-4.6",
      system: "You are a precise automation agent.",
      tools: ["http.request", "state.get", "state.set", "schedule.list", "run.get"],
    },
  },
  providers: {
    openrouter: {
      apiKey: { env: "OPENROUTER_API_KEY" },
    },
    ollama: {
      baseUrl: "http://127.0.0.1:11434",
    },
  },
  apis: {
    example: {
      baseUrl: "https://api.example.com",
      auth: { bearer: { env: "EXAMPLE_API_TOKEN" } },
      allow: [{ method: "GET", path: "/v1/items/*" }],
    },
  },
  webhooks: {
    ingest: {
      path: "/webhooks/ingest",
      agentId: "main",
      secret: { env: "ICLAW_WEBHOOK_INGEST_SECRET" },
      idempotency: { header: "Idempotency-Key" },
      approvalMode: "fail",
    },
  },
  schedules: {
    morning: {
      agentId: "main",
      schedule: { cron: "0 9 * * *", timezone: "Asia/Hong_Kong" },
      input: { text: "Run the morning automation." },
      approvalMode: "fail",
      enabled: true,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 32768,
    token: { env: "ICLAW_SERVER_TOKEN" },
  },
  storage: {
    sqlitePath: "~/.iclaw/state.sqlite",
  },
}
```

## SQLite Schema

Use `node:sqlite` directly. Keep migrations local and explicit.

```sql
CREATE TABLE schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at_ms INTEGER NOT NULL
);

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
CREATE UNIQUE INDEX idx_runs_idempotency ON runs(trigger_type, trigger_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

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
```

## HTTP API Contract

Native endpoints are canonical.

```text
GET    /health
GET    /agents
POST   /runs
GET    /runs
GET    /runs/:id
GET    /runs/:id/events
POST   /runs/:id/cancel
POST   /approvals/:id/approve
POST   /approvals/:id/reject
GET    /schedules
POST   /schedules
GET    /schedules/:id
PATCH  /schedules/:id
DELETE /schedules/:id
POST   /schedules/:id/run
POST   /webhooks/:id
GET    /webhooks
```

`POST /runs` request:

```json
{
  "agentId": "main",
  "input": { "text": "Run the automation." },
  "sessionId": "optional-session",
  "idempotencyKey": "optional-key",
  "toolPolicy": {
    "allow": ["http.request", "state.get", "state.set"]
  }
}
```

`POST /runs` response:

```json
{
  "runId": "run_01",
  "status": "queued"
}
```

`GET /runs/:id/events` streams newline-delimited event objects:

```json
{"seq":1,"type":"run.started","payload":{"agentId":"main"}}
{"seq":2,"type":"model.output.delta","payload":{"text":"Working"}}
{"seq":3,"type":"tool.call","payload":{"name":"http.request"}}
{"seq":4,"type":"run.succeeded","payload":{"summary":"Done"}}
```

## Scheduler Contract

Expose one product concept: schedules.

Supported schedule expressions:

```json
{ "at": "2026-05-19T09:00:00+08:00" }
{ "every": "5m" }
{ "cron": "0 9 * * *", "timezone": "Asia/Hong_Kong" }
```

Rules:

- Schedules create runs.
- Schedules store next-run state in SQLite.
- Schedules can be paused by setting `enabled: false`.
- If a scheduled run needs approval, default behavior is `approvalMode: "fail"`.
- `approvalMode: "pause"` is opt-in and must set an expiry.
- No automatic background approval.

## Tool Contract

Core tools:

- `http.request`
- `schedule.create`
- `schedule.update`
- `schedule.delete`
- `schedule.list`
- `run.create`
- `run.get`
- `run.list`
- `state.get`
- `state.set`
- `state.delete`
- `state.list`
- `webhook.respond`

Optional tool packs, disabled by default:

- `shell.exec`
- `file.read`
- `file.write`
- `file.list`
- `web.fetch`

Security rules:

- Tools are denied unless allowed by agent config or per-run policy.
- `http.request` can only call configured APIs.
- API allowlists include method and path matching.
- Secrets resolve from configured env/file references.
- Shell and file tools require explicit per-agent enablement.
- Approval-required tools pause the run only when the trigger allows pausing.

## Minimal Plugin Seam

Keep a small first-party contract. Do not preserve the broad old SDK.

```ts
export type IclawPlugin = {
  id: string;
  register(api: IclawPluginApi): void | Promise<void>;
};

export type IclawPluginApi = {
  registerProvider(provider: ModelProvider): void;
  registerTool(tool: AgentTool): void;
  registerRoute(route: HttpRoute): void;
  registerWebhook(handler: WebhookHandler): void;
  registerScheduleKind(kind: ScheduleKind): void;
  declareConfig(schema: ConfigSchema): void;
};
```

Initial built-in plugins:

- OpenRouter provider
- Ollama provider
- Core tools
- Webhook routes
- Scheduler

## TUI Contract

TUI is the operator console.

Views:

- Chat: selected agent and session.
- Runs: active/history, inspect events, cancel, approve, reject.
- Schedules: list, create, edit, disable, run now.
- Webhooks/APIs: configured endpoints and recent deliveries.
- Config/status: provider health, DB path, server URL.

The TUI talks to the same run API as headless clients. Embedded-only shortcuts can exist internally, but the API must remain the source of truth.

## Implementation Tasks

### Task 1: Freeze Product Contract

**Files:**

- Modify: `docs/plan/iclaw-v1-headless-architecture.md`
- Create: `docs/README.md`

- [x] **Step 1: Add a short docs index**

Create `docs/README.md`:

```markdown
# iclaw Docs

iclaw is a headless API automation agent with a terminal operator console.

Planned docs (created in later tasks):

- `config.md` for configuration
- `api.md` for native HTTP APIs
- `schedules.md` for scheduled runs
- `webhooks.md` for inbound webhook triggers
- `providers.md` for OpenRouter and Ollama
- `security.md` for tool and approval policy
```

- [x] **Step 2: Verify docs are discoverable**

Run:

```bash
rg -n "iclaw is a headless API automation agent" docs/README.md
```

Expected: one match.

- [x] **Step 3: Commit**

```bash
git add docs/README.md docs/plan/iclaw-v1-headless-architecture.md
git commit -m "docs: define iclaw v1 headless architecture"
```

### Task 2: Collapse Package Shape

**Files:**

- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `tsconfig.json`
- Modify: `tsconfig.*.json`

- [x] **Step 1: Remove workspace packages from pnpm workspace**

Set `pnpm-workspace.yaml` package list to:

```yaml
packages:
  - .
```

Keep `minimumReleaseAge`, `minimumReleaseAgeExclude`, `onlyBuiltDependencies`, and `ignoredBuiltDependencies`.

- [x] **Step 2: Narrow package metadata**

Set root package metadata:

```json
{
  "name": "iclaw",
  "description": "Headless API automation agent with a terminal operator console",
  "bin": {
    "iclaw": "iclaw.mjs"
  },
  "type": "module"
}
```

Remove exports that point to broad plugin SDK surfaces not retained by v1.

- [x] **Step 3: Narrow TypeScript includes**

Keep TypeScript includes focused on:

```json
{
  "include": ["src/**/*", "test/**/*", "scripts/**/*"]
}
```

- [x] **Step 4: Run package sanity checks**

Run:

```bash
pnpm install --lockfile-only
pnpm build
```

Expected: lockfile updates cleanly and build either passes or reports only imports from surfaces scheduled for deletion in the next task.

Observed result in this trim stage:

- `pnpm install --lockfile-only` completed and updated `pnpm-lock.yaml`.
- `pnpm build` reports only unresolved entries from removed extension surfaces:
  - `extensions/telegram/src/audit.ts`
  - `extensions/telegram/src/token.ts`

- [x] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json tsconfig.*.json
git commit -m "chore: collapse iclaw to a single pnpm package"
```

### Task 3: Add Fresh Config Layer

**Files:**

- Create: `src/config/schema.ts`
- Create: `src/config/load.ts`
- Create: `src/config/paths.ts`
- Create: `src/config/types.ts`
- Test: `test/config/config.test.ts`

- [ ] **Step 1: Write config tests**

Create `test/config/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseIclawConfig } from "../../src/config/schema.js";

describe("iclaw config", () => {
  it("accepts the minimal v1 config", () => {
    const parsed = parseIclawConfig({
      agents: {
        main: {
          model: "openrouter/anthropic/claude-sonnet-4.6",
          system: "You are precise.",
          tools: ["http.request"],
        },
      },
      providers: {
        openrouter: { apiKey: { env: "OPENROUTER_API_KEY" } },
        ollama: { baseUrl: "http://127.0.0.1:11434" },
      },
      server: { host: "127.0.0.1", port: 32768 },
    });

    expect(parsed.agents.main.model).toBe("openrouter/anthropic/claude-sonnet-4.6");
  });

  it("rejects unknown providers", () => {
    expect(() =>
      parseIclawConfig({
        agents: { main: { model: "other/model", tools: [] } },
        providers: { other: {} },
      }),
    ).toThrow(/provider/i);
  });
});
```

- [ ] **Step 2: Implement config types and schema**

Create `src/config/types.ts` with explicit v1 types for agents, providers, APIs, webhooks, schedules, server, and storage.

Create `src/config/schema.ts` with a Zod schema or existing local schema helper. The accepted provider keys are exactly `openrouter` and `ollama`.

- [ ] **Step 3: Implement paths**

Create `src/config/paths.ts`:

```ts
import os from "node:os";
import path from "node:path";

export function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.ICLAW_STATE_DIR?.trim() || path.join(os.homedir(), ".iclaw");
}

export function resolveConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.ICLAW_CONFIG_PATH?.trim() || path.join(resolveStateDir(env), "iclaw.json");
}

export function resolveSqlitePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.ICLAW_SQLITE_PATH?.trim() || path.join(resolveStateDir(env), "state.sqlite");
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test test/config/config.test.ts
```

Expected: config tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/config test/config
git commit -m "feat: add fresh iclaw config contract"
```

### Task 4: Add SQLite Storage Layer

**Files:**

- Create: `src/storage/sqlite.ts`
- Create: `src/storage/migrations.ts`
- Create: `src/storage/schema.ts`
- Create: `src/storage/runs.ts`
- Create: `src/storage/schedules.ts`
- Create: `src/storage/webhooks.ts`
- Create: `src/storage/approvals.ts`
- Create: `src/storage/state.ts`
- Test: `test/storage/sqlite.test.ts`

- [ ] **Step 1: Write migration test**

Create `test/storage/sqlite.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openIclawDatabase } from "../../src/storage/sqlite.js";

describe("iclaw sqlite storage", () => {
  it("creates v1 tables", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "iclaw-storage-"));
    const db = openIclawDatabase(path.join(dir, "state.sqlite"));
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(rows.map((row) => row.name)).toContain("runs");
    expect(rows.map((row) => row.name)).toContain("run_events");
    expect(rows.map((row) => row.name)).toContain("schedules");
    expect(rows.map((row) => row.name)).toContain("webhooks");
    expect(rows.map((row) => row.name)).toContain("approvals");
    db.close();
  });
});
```

- [ ] **Step 2: Implement SQLite open helper**

Create `src/storage/sqlite.ts` using `node:sqlite`:

```ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrations.js";

export function openIclawDatabase(dbPath: string): DatabaseSync {
  mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 1000");
  runMigrations(db);
  return db;
}
```

- [ ] **Step 3: Implement v1 migration**

Create `src/storage/migrations.ts` with the SQL from this plan. Insert migration id `2026-05-18-v1`.

- [ ] **Step 4: Run storage tests**

Run:

```bash
pnpm test test/storage/sqlite.test.ts
```

Expected: storage tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/storage test/storage
git commit -m "feat: add sqlite state store"
```

### Task 5: Build Run API Core

**Files:**

- Create: `src/runs/types.ts`
- Create: `src/runs/service.ts`
- Create: `src/server/routes/runs.ts`
- Test: `test/runs/runs.test.ts`
- Test: `test/server/runs-api.test.ts`

- [ ] **Step 1: Write run lifecycle test**

Create `test/runs/runs.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openIclawDatabase } from "../../src/storage/sqlite.js";
import { createRunService } from "../../src/runs/service.js";

describe("run service", () => {
  it("creates a queued run and appends events", async () => {
    const db = openIclawDatabase(
      path.join(mkdtempSync(path.join(os.tmpdir(), "iclaw-runs-")), "state.sqlite"),
    );
    const runs = createRunService({ db });
    const run = await runs.createRun({
      agentId: "main",
      triggerType: "api",
      input: { text: "hello" },
    });

    await runs.appendEvent(run.id, "run.queued", { agentId: "main" });
    const events = await runs.listEvents(run.id);

    expect(run.status).toBe("queued");
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("run.queued");
    db.close();
  });
});
```

- [ ] **Step 2: Implement run repository and service**

Implement `createRunService` with `createRun`, `getRun`, `listRuns`, `appendEvent`, `listEvents`, `markRunning`, `markSucceeded`, `markFailed`, `markWaitingApproval`, and `cancelRun`.

- [ ] **Step 3: Add HTTP routes**

Implement `POST /runs`, `GET /runs`, `GET /runs/:id`, `GET /runs/:id/events`, and `POST /runs/:id/cancel`.

- [ ] **Step 4: Run run tests**

Run:

```bash
pnpm test test/runs/runs.test.ts test/server/runs-api.test.ts
```

Expected: run service and API tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/runs src/server/routes/runs.ts test/runs test/server
git commit -m "feat: add native run API"
```

### Task 6: Wire Minimal Agent Execution

**Files:**

- Create: `src/agent/types.ts`
- Create: `src/agent/execute.ts`
- Create: `src/agent/model.ts`
- Create: `src/providers/openrouter/index.ts`
- Create: `src/providers/ollama/index.ts`
- Test: `test/agent/execute.test.ts`
- Test: `test/providers/openrouter.test.ts`
- Test: `test/providers/ollama.test.ts`

- [ ] **Step 1: Write provider resolution tests**

Create tests that assert:

- `openrouter/anthropic/claude-sonnet-4.6` resolves to provider `openrouter` and model `anthropic/claude-sonnet-4.6`.
- `ollama/llama3.2` resolves to provider `ollama` and model `llama3.2`.
- Any other provider prefix throws.

- [ ] **Step 2: Implement provider interface**

Create:

```ts
export type ModelProvider = {
  id: "openrouter" | "ollama";
  stream(input: ModelStreamInput): AsyncIterable<ModelStreamEvent>;
  listModels?(): Promise<Array<{ id: string; name?: string }>>;
};
```

- [ ] **Step 3: Implement OpenRouter transport**

Use OpenAI-compatible chat completions transport against `https://openrouter.ai/api/v1` with `Authorization: Bearer <key>`.

- [ ] **Step 4: Implement Ollama transport**

Use Ollama local HTTP API with configured `baseUrl`.

- [ ] **Step 5: Connect run service to agent execution**

Run execution must append events for start, model deltas, tool calls, success, failure, and approval waits.

- [ ] **Step 6: Run agent/provider tests**

Run:

```bash
pnpm test test/agent test/providers
```

Expected: provider and execution tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/agent src/providers test/agent test/providers
git commit -m "feat: add minimal agent execution"
```

### Task 7: Add Tool Policy and Approvals

**Files:**

- Create: `src/tools/registry.ts`
- Create: `src/tools/http-request.ts`
- Create: `src/tools/state.ts`
- Create: `src/tools/runs.ts`
- Create: `src/tools/schedules.ts`
- Create: `src/approvals/service.ts`
- Create: `src/server/routes/approvals.ts`
- Test: `test/tools/policy.test.ts`
- Test: `test/approvals/approvals.test.ts`

- [ ] **Step 1: Write deny-by-default tests**

Assert that `http.request` fails when the host is not declared in config and succeeds when method/path match an allow rule.

- [ ] **Step 2: Write approval tests**

Assert that approval-required tool calls move the run to `waiting_approval`, and that approve/reject updates the approval row.

- [ ] **Step 3: Implement core tools**

Implement `http.request`, `state.*`, `run.*`, `schedule.*`, and `webhook.respond`.

- [ ] **Step 4: Implement approval API**

Implement `POST /approvals/:id/approve` and `POST /approvals/:id/reject`.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test test/tools test/approvals
```

Expected: tool policy and approval tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools src/approvals src/server/routes/approvals.ts test/tools test/approvals
git commit -m "feat: add tool policy and approvals"
```

### Task 8: Add Scheduler

**Files:**

- Create: `src/scheduler/types.ts`
- Create: `src/scheduler/parse.ts`
- Create: `src/scheduler/service.ts`
- Create: `src/server/routes/schedules.ts`
- Test: `test/scheduler/scheduler.test.ts`
- Test: `test/server/schedules-api.test.ts`

- [ ] **Step 1: Write schedule parser tests**

Assert support for:

```json
{ "at": "2026-05-19T09:00:00+08:00" }
{ "every": "5m" }
{ "cron": "0 9 * * *", "timezone": "Asia/Hong_Kong" }
```

- [ ] **Step 2: Implement parser and due-run service**

Use deterministic next-run computation. Persist `next_run_at_ms` in SQLite.

- [ ] **Step 3: Implement schedule routes**

Implement `GET/POST/PATCH/DELETE /schedules` plus `POST /schedules/:id/run`.

- [ ] **Step 4: Run scheduler tests**

Run:

```bash
pnpm test test/scheduler test/server/schedules-api.test.ts
```

Expected: scheduler tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scheduler src/server/routes/schedules.ts test/scheduler test/server/schedules-api.test.ts
git commit -m "feat: add unified scheduler"
```

### Task 9: Add Webhooks

**Files:**

- Create: `src/webhooks/types.ts`
- Create: `src/webhooks/service.ts`
- Create: `src/server/routes/webhooks.ts`
- Test: `test/webhooks/webhooks.test.ts`
- Test: `test/server/webhooks-api.test.ts`

- [ ] **Step 1: Write webhook auth tests**

Assert missing or wrong secret returns 401 and valid secret creates a run.

- [ ] **Step 2: Write idempotency tests**

Assert duplicate delivery with the same idempotency key returns the existing run id.

- [ ] **Step 3: Implement webhook service**

Persist delivery request and response metadata in `webhook_deliveries`.

- [ ] **Step 4: Implement webhook routes**

Implement `POST /webhooks/:id` and `GET /webhooks`.

- [ ] **Step 5: Run webhook tests**

Run:

```bash
pnpm test test/webhooks test/server/webhooks-api.test.ts
```

Expected: webhook tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/webhooks src/server/routes/webhooks.ts test/webhooks test/server/webhooks-api.test.ts
git commit -m "feat: add authenticated webhooks"
```

### Task 10: Convert TUI to Operator Console

**Files:**

- Modify: `src/tui/**`
- Create: `src/tui/views/runs.ts`
- Create: `src/tui/views/schedules.ts`
- Create: `src/tui/views/webhooks.ts`
- Create: `src/tui/views/status.ts`
- Test: `test/tui/operator-console.test.ts`

- [ ] **Step 1: Write TUI state tests**

Assert the TUI can switch between chat, runs, schedules, webhooks, and status views.

- [ ] **Step 2: Wire TUI to native API client**

The TUI should call native run, schedule, webhook, approval, and status endpoints.

- [ ] **Step 3: Add run approval controls**

Runs in `waiting_approval` must expose approve and reject actions.

- [ ] **Step 4: Run TUI tests**

Run:

```bash
pnpm test test/tui/operator-console.test.ts
```

Expected: TUI operator state tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tui test/tui/operator-console.test.ts
git commit -m "feat: make tui an operator console"
```

### Task 11: Destructive Surface Trim

**Files:**

- Delete: `apps/**`
- Delete: `ui/**`
- Delete: removed `extensions/**`
- Delete: removed channel code under `src/channels/**`
- Delete: removed docs under `docs/**`
- Delete: removed legacy migration code
- Modify: `.github/**`
- Modify: `scripts/**`
- Modify: `test/**`

- [ ] **Step 1: Remove product surfaces outside v1**

Delete mobile, app, web UI, channel, memory, media, voice, browser, MCP, docs-site, and legacy migration surfaces not required by v1.

- [ ] **Step 2: Remove scripts for deleted surfaces**

Remove package scripts and CI lanes that reference deleted surfaces.

- [ ] **Step 3: Remove tests for deleted surfaces**

Remove Vitest configs and test shards for deleted modules.

- [ ] **Step 4: Run broad import check**

Run:

```bash
pnpm build
```

Expected: build passes or reports only stale imports in files scheduled for deletion in this same task.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: trim iclaw to v1 headless surface"
```

### Task 12: Final Rename and Docs Sweep

**Files:**

- Modify: all retained files with legacy product naming
- Create: `docs/config.md`
- Create: `docs/api.md`
- Create: `docs/schedules.md`
- Create: `docs/webhooks.md`
- Create: `docs/providers.md`
- Create: `docs/security.md`

- [ ] **Step 1: Write focused docs**

Create concise Markdown docs for config, API, schedules, webhooks, providers, and security.

- [ ] **Step 2: Run legacy name sweep**

Run:

```bash
rg -n "OpenClaw|openclaw|@openclaw|\\.openclaw" .
```

Expected: no matches in retained product code or user-facing docs. Matches are allowed only in historical planning docs that explicitly discuss the fork.

- [ ] **Step 3: Run validation**

Run:

```bash
pnpm build
pnpm test
pnpm check:changed
```

Expected: all retained v1 gates pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: finish iclaw v1 rename and docs"
```

## Validation Gates

Default per task:

```bash
pnpm check:changed
```

Use targeted tests while building:

```bash
pnpm test test/config
pnpm test test/storage
pnpm test test/runs
pnpm test test/server
pnpm test test/scheduler
pnpm test test/webhooks
pnpm test test/tools
pnpm test test/approvals
pnpm test test/tui
```

Before handoff:

```bash
pnpm build
pnpm test
pnpm check:changed
```

## Open Questions

None blocking v1 implementation. The following are explicitly deferred:

- OpenAI-compatible HTTP API
- MCP
- Browser automation
- Subagents
- Memory
- Media and voice
- Desktop/mobile apps
- Public third-party SDK
- Remote hosted deployment story

## Execution Notes

- Do not preserve deleted surfaces behind feature flags.
- Do not add compatibility migrations.
- Do not add extra providers while building v1.
- Keep each task buildable before moving on.
- Prefer direct SQL and small typed repositories over ORM abstractions.
- Keep docs small and local.
- If a retained module still carries old product naming, rename it during Task 12 unless it blocks earlier tasks.
