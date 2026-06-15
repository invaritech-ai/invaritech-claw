# iclaw Thread and Memory V1 Design

Status: decision checkpoint from grill-me session on 2026-06-15.

## Product Direction

iclaw should use the original OpenClaw repo as a design reference, not as code to restore wholesale. Build iclaw-native modules and selectively copy only small pure algorithms or tests when they clearly fit.

The v1 product should be an ongoing terminal assistant centered on objectives, threads, memory, and compaction. The current `runs` mental model should be replaced publicly by threads and messages.

## Keep From Original Design

- Thread/session model.
- Compaction.
- Memory curation.
- Context reconstruction.
- Manual model switching.
- Context-window guard/warnings.
- Operator commands such as `/compact`, `/model`, `/memory`, `/remember`, `/status`.
- Basic provider health/status.

## Defer From V1

- Tools.
- Approvals.
- Scheduler/cron.
- Webhooks.
- Multi-agent routing.
- Sandboxing.
- OAuth/auth profiles.
- Browser/canvas/voice/mobile/channels.
- Plugin SDK.

Tools stay out until thread, memory, and compaction are solid. V1 messages are plain Markdown text only.

## Core Objects

User-facing objects:

- `thread`
- `message`
- `memory`
- `thread_summary`

Internal/debug objects:

- `model_invocation`
- `background_job`
- `memory_event`

The public API should replace `/runs` with thread APIs:

- `POST /threads`
- `GET /threads`
- `GET /threads/:id`
- `POST /threads/:id/messages`
- `GET /threads/:id/messages`
- `POST /threads/:id/compact`

Multiple named threads are supported. `iclaw tui` opens the last active thread or creates a default main thread.

Thread fields include:

- `id`
- `title`
- `objective`
- `activeModelRef`
- `createdAtMs`
- `updatedAtMs`
- `archivedAtMs`

Messages store full raw history forever in v1. Compaction reduces prompt context, not stored audit history.

## Thread Commands

- `/new [title]` creates a new thread.
- `/thread list`
- `/thread new [title]`
- `/thread switch <id-or-title>`
- `/thread rename <title>`
- `/thread archive <id-or-title>`
- `/objective`
- `/objective <new objective>`

Thread archive hides threads from default lists. It does not hard-delete.

## Model Handling

Manual model switching only for v1. No automatic model routing.

Commands:

- `/model`
- `/model list`
- `/model set <modelRef>`

`/model set` persists to the active thread. Each assistant message stores the actual model used internally, but normal TUI output should not over-emphasize model provenance.

Model listing should include:

- locally available Ollama models from `/api/tags`
- configured OpenRouter favorites

Do not fetch the full OpenRouter catalog in v1.

Recommended local defaults:

```json5
{
  models: {
    chat: "ollama/gemma4:e4b",
    memory: "ollama/qwen3:4b",
    compaction: "ollama/gemma4:e4b",
    embedding: "ollama/mxbai-embed-large:latest",
    favorites: [
      "openrouter/anthropic/claude-sonnet-4.6",
      "openrouter/openai/gpt-5.1",
    ],
  },
}
```

Memory and compaction use dedicated configured models with fallback to chat model.

Provider interface should add a non-streaming completion method:

```ts
type ModelProvider = {
  id: string;
  stream(input): AsyncIterable<ModelStreamEvent>;
  complete(input): Promise<ModelCompleteResult>;
  listModels?(): Promise<ModelListItem[]>;
};
```

Use `stream()` for user chat and `complete()` for compaction and future memory curation.

## Memory

Memory is core. "Soul" is not a separate setup object. Agent behavior should emerge from durable memories, preferences, decisions, constraints, principles, and project history.

Memory scopes:

- `thread`
- `global`

Thread memories are created more freely. Global memories are conservative and should usually require operator confirmation when proposed by the automatic curator.

Memory types are a fixed enum:

- `fact`
- `preference`
- `decision`
- `constraint`
- `principle`
- `milestone`

Memories may also have tags.

Memory records include:

- `id`
- `scope`
- `threadId`
- `type`
- `content`
- `tags`
- `importance`
- `confidence`
- `status`
- `supersedesMemoryId`
- `createdFromMessageId`
- `updatedFromMessageId`
- `createdAtMs`
- `updatedAtMs`

Memory events track:

- `created`
- `updated`
- `merged`
- `rejected`
- `forgotten`

Memory curator actions:

- `ignore`
- `create`
- `update`
- `merge`
- `propose_global`

Do not store subjective or psychological inferences unless explicitly requested. Prefer operational principles such as: "Keep progress visible, avoid long ambiguous stalls, and surface blockers early."

Manual memory commands:

- `/remember <text>`
- `/remember thread <text>`
- `/remember global <text>`
- `/memory [query]`
- `/memory global [query]`
- `/memory thread [query]`
- `/memory used`
- `/forget <id-prefix-or-id>`

Memory IDs should display as short stable prefixes in normal TUI output. Commands accept deterministic non-ambiguous prefixes.

`/forget` soft-deletes memories by setting status to `forgotten` and appending a memory event.

Milestone A uses SQLite FTS memory search only. Milestone B adds embeddings and hybrid retrieval with `mxbai-embed-large`.

Context reconstruction in Milestone A should retrieve memories automatically from the current user message using FTS, plus recent/high-importance fallback memories. Suggested cap: at most eight memories total, split between thread and global memories.

## Compaction

Compaction exists to preserve conversation continuity while keeping model context manageable.

Milestone A:

- manual `/compact`
- manual `/summary`
- real model call using `models.compaction`
- thread summary is included in future reconstructed context
- no automatic background compaction yet

Milestone B:

- automatic threshold compaction
- background compaction jobs
- checkpoint memory curation during compaction

Compaction should preserve:

- objective
- decisions
- constraints
- open questions
- current status
- important identifiers exactly

## Context Visibility

The TUI should show light context visibility without clutter.

Default status line example:

```text
context: summary + 5 recent messages + 4 memories
```

Commands:

- `/context`
- `/memory-used`

`/context` shows active model, summary inclusion, memory IDs/titles included, recent message count, and rough token estimate.

## TUI

V1 can stay line-based, but should be designed so fullscreen can replace rendering without changing core business logic.

Requirements:

- clean operator client/service layer
- command parser separated from rendering
- structured views, not business logic embedded in the REPL loop
- thread/memory/context APIs are UI-agnostic

Fullscreen TUI is desired ASAP after the base is working.

## Background Jobs

Background jobs run in the same server process for v1 with a clean worker abstraction.

Jobs are durable in SQLite. Pending jobs should resume after restart.

Milestone B jobs:

- turn-level memory curation after assistant messages
- checkpoint curation during compaction
- automatic compaction
- embedding generation

Later, add a separate `iclaw worker` command if needed.

## Prompt Overrides

Built-in prompts should exist for memory curation and compaction. Config can override them:

```json5
{
  memory: {
    curatorPromptPath: "~/.iclaw/prompts/memory-curator.md",
    compactionPromptPath: "~/.iclaw/prompts/compactor.md",
  },
}
```

TUI command:

- `/prompts`

## Milestones

### Milestone A: Thread-First Base

- Replace public `runs` with `threads`.
- SQLite schema for threads, messages, summaries, memories, memory events, model invocations, background jobs.
- TUI chat persists messages to active thread.
- Thread commands.
- Model commands and per-thread model persistence.
- Provider `complete()` method.
- Manual `/remember`, `/memory`, `/forget`.
- FTS memory retrieval.
- Context reconstruction with summary, memories, and recent messages.
- Manual `/compact` using real compaction model.
- `/summary`, `/context`, `/memory-used`.

### Milestone B: Background Intelligence

- In-process background worker loop.
- Automatic turn-level memory curator.
- Checkpoint curator during compaction.
- Automatic threshold compaction.
- Embedding generation with Ollama.
- Hybrid FTS + embedding memory retrieval.
- Global memory proposals with accept/reject flow.

