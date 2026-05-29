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
- schedules, webhooks, runs, approvals, and a small deny-by-default tool registry

## Status

This is a hard-fork v1 foundation. It does not include compatibility shims, migration helpers, channel integrations, companion apps, browser control, media, voice, memory, MCP, or a broad provider catalog.

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
      tools: [],
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
pnpm iclaw tui --view status
pnpm iclaw tui --view runs
pnpm iclaw tui --view schedules
pnpm iclaw tui --view webhooks
```

Create a run:

```bash
curl -sS http://127.0.0.1:32768/runs \
  -H 'content-type: application/json' \
  -d '{"agentId":"main","triggerType":"api","input":{"text":"hello"}}'
```

## Commands

```bash
pnpm iclaw --help
pnpm iclaw --version
pnpm iclaw server [--host <host>] [--port <port>] [--config <path>]
pnpm iclaw tui [--base-url <url>] [--view <chat|runs|schedules|webhooks|status>]
```

## Docs

- [Config](docs/config.md)
- [API](docs/api.md)
- [Schedules](docs/schedules.md)
- [Webhooks](docs/webhooks.md)
- [Providers](docs/providers.md)
- [Security](docs/security.md)
- [Architecture plan](docs/plan/iclaw-v1-headless-architecture.md)

## Development

```bash
pnpm build
pnpm test
pnpm check:changed
pnpm check
pnpm format:check
```

Use `pnpm iclaw` for the local development CLI. The package entrypoint is `iclaw.mjs`, and build output is emitted to `dist/`.
