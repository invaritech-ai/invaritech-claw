# Config

iclaw reads JSON5 config from `~/.iclaw/iclaw.json` by default.

Path overrides:

- `ICLAW_STATE_DIR`: default directory for config and state
- `ICLAW_CONFIG_PATH`: exact config file path
- `ICLAW_SQLITE_PATH`: exact SQLite database path

## Shape

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
    openrouter: {
      apiKey: { env: "OPENROUTER_API_KEY" },
      baseUrl: "https://openrouter.ai/api/v1",
    },
    ollama: {
      baseUrl: "http://127.0.0.1:11434",
    },
  },
  server: {
    host: "127.0.0.1",
    port: 32768,
  },
  storage: {
    sqlitePath: "/absolute/path/to/state.db",
  },
}
```

## Agents

`agents` is a map of agent ids to agent config.

- `model`: required provider-prefixed model reference
- `system`: optional system prompt
- `tools`: explicit tool ids available to the agent

Model references use `provider/model`:

- `openrouter/anthropic/claude-sonnet-4.6`
- `ollama/llama3.2`

## Providers

Only `openrouter` and `ollama` are supported in v1.

OpenRouter requires an API key secret reference:

```json5
{ env: "OPENROUTER_API_KEY" }
```

or:

```json5
{ value: "local-development-key" }
```

Prefer `env` for real secrets.

## Server

Defaults:

- `host`: `127.0.0.1`
- `port`: `32768`

Keep loopback binding unless a trusted reverse proxy or tunnel provides authentication.

## Storage

`storage.sqlitePath` points at the SQLite database. If omitted, iclaw uses `~/.iclaw/state.db`.

Config values are not shell-expanded. If you set `storage.sqlitePath`, use an absolute path or a path relative to the current working directory.
