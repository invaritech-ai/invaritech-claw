# iclaw

iclaw is a local terminal assistant with a headless HTTP API and an operator console.

The v1 shape is intentionally small:

- one pnpm-managed TypeScript package
- Node 22+ runtime
- SQLite state through `node:sqlite`
- JSON5 config at `~/.iclaw/iclaw.json` unless overridden
- local HTTP API bound to loopback by default
- TUI/operator console entrypoint for threads, messages, memory, and compaction
- OpenRouter and Ollama providers

## Status

This is a thread-first v1 foundation for the smallest useful loop: initialize config, start the local server, open the TUI, chat in a persisted thread, save memories, inspect context, and compact history.

## Install

```bash
pnpm install
pnpm build
```

Node 22.14.0 or newer is required. The repo is managed with pnpm and keeps dependency guardrails in `package.json` and `.npmrc`.

## Quick Start

Create `~/.iclaw/iclaw.json` if it does not exist:

```bash
pnpm iclaw init
```

To refresh an existing config, pass `--force`:

```bash
pnpm iclaw init --force
```

Start the local server:

```bash
pnpm iclaw server
```

Open the operator console:

```bash
pnpm iclaw tui
```

Common first commands:

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

`iclaw init` prefers installed Ollama models when available. If no preferred local model is found and `OPENROUTER_API_KEY` is unset, the static fallback is:

```json5
{
  models: {
    chat: "ollama/gemma4:e4b",
    memory: "ollama/qwen3:4b",
    compaction: "ollama/gemma4:e4b",
    embedding: "ollama/mxbai-embed-large:latest",
  },
  providers: { ollama: { baseUrl: "http://127.0.0.1:11434" } },
  server: {
    host: "127.0.0.1",
    port: 32768,
  },
}
```

If `OPENROUTER_API_KEY` is present, `iclaw init` also includes `providers.openrouter.apiKey` as an environment secret reference.

Check health:

```bash
curl -sS http://127.0.0.1:32768/health
```

Create a thread through the API:

```bash
curl -sS http://127.0.0.1:32768/threads \
  -H 'content-type: application/json' \
  -d '{"title":"main","objective":"Keep useful project context."}'
```

## Commands

```bash
pnpm iclaw --help
pnpm iclaw --version
pnpm iclaw init [--config <path>] [--force]
pnpm iclaw server [--host <host>] [--port <port>] [--config <path>]
pnpm iclaw tui [--base-url <url>] [--agent <agent>] [--view <chat|status>] [--config <path>] [--api-token <token>]
```

Operator console commands:

```text
/help
/new [title]
/thread list
/thread switch <id>
/thread rename <title>
/thread archive [id]
/objective [text]
/model
/model list
/model set <provider/model>
/remember [global|thread] <text>
/memory [thread|global] [query]
/memory-used
/forget <memory-id-prefix>
/context
/context full
/compact
/summary
/exit
```

## Security

Servers bind to `127.0.0.1` by default. If `server.apiToken` is configured, HTTP clients must send `Authorization: Bearer <token>`. Binding to a non-loopback host requires `server.apiToken`.

## Development

```bash
pnpm build
pnpm test
pnpm check:changed
pnpm check
pnpm lint
pnpm format:check
```

Use `pnpm iclaw` for the local development CLI. The package entrypoint is `iclaw.mjs`, and build output is emitted to `dist/`.
