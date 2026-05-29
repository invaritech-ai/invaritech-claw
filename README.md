# iclaw

iclaw is a minimal headless API automation agent with a terminal operator console.

The v1 shape is intentionally small:

- one pnpm-managed TypeScript package
- Node 22+ runtime
- SQLite state through `node:sqlite`
- JSON5 config
- local HTTP API
- TUI/operator console entrypoint
- OpenRouter and Ollama providers
- runs created by the API or TUI

## Status

This is a hard-fork v1 foundation for the smallest usable loop: configure a provider, start the server, open the TUI, submit a prompt, and inspect persisted runs.

## Install

```bash
pnpm install
pnpm build
```

Node 22.14.0 or newer is required. The repo is managed with pnpm and keeps dependency guardrails in `package.json` and `.npmrc`.

## Quick Start

Create `~/.iclaw/iclaw.json`:

```json5
{
  agents: {
    main: {
      model: "ollama/llama3.2",
      system: "You are a concise automation agent.",
    },
  },
  providers: {
    ollama: {
      baseUrl: "http://127.0.0.1:11434",
    },
    openrouter: {
      apiKey: { env: "OPENROUTER_API_KEY" },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 32768,
  },
}
```

Start the local server:

```bash
pnpm iclaw server
```

Check health:

```bash
curl -sS http://127.0.0.1:32768/health
```

Open an operator view:

```bash
pnpm iclaw tui --agent main
```

Or print a specific operator view as JSON:

```bash
pnpm iclaw tui --view status
pnpm iclaw tui --view runs
```

Create a run:

```bash
curl -sS http://127.0.0.1:32768/runs \
  -H 'content-type: application/json' \
  -d '{"agentId":"main","triggerType":"api","execute":true,"input":{"text":"hello"}}'
```

## Commands

```bash
pnpm iclaw --help
pnpm iclaw --version
pnpm iclaw server [--host <host>] [--port <port>] [--config <path>]
pnpm iclaw tui [--base-url <url>] [--view <chat|runs|status>]
```

## Development

```bash
pnpm build
pnpm test
pnpm check:changed
pnpm check
pnpm format:check
```

Use `pnpm iclaw` for the local development CLI. The package entrypoint is `iclaw.mjs`, and build output is emitted to `dist/`.
