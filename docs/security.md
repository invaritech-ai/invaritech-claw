# Security

iclaw v1 is local-first. The default server bind is `127.0.0.1`.

## Boundaries

- The operator, config file, SQLite database, and local process are trusted.
- HTTP callers are trusted only if the server is protected by loopback or external auth.
- Webhook payloads are untrusted.
- Agent/model output is untrusted.
- Custom APIs, webhooks, providers, and tools are trusted code.

## HTTP Server

The built-in HTTP API has no remote authentication in v1. Do not bind to `0.0.0.0` unless another layer enforces auth.

Recommended remote pattern:

1. Keep iclaw bound to loopback.
2. Put a reverse proxy or tunnel in front.
3. Enforce auth and TLS at that layer.
4. Forward only the endpoints you need.

## Secrets

Prefer environment-backed secret references:

```json5
{ env: "OPENROUTER_API_KEY" }
```

Avoid committing configs with `{ value: "..." }` secrets.

## Tools

Tools are deny by default. Enable tools per agent and keep tool inputs validated.

The current core tools cover:

- `http.request`
- `state.set`
- `state.get`
- `state.list`
- `state.delete`
- `run.get`
- `run.list`
- `run.events`
- `run.cancel`
- `schedule.get`
- `schedule.due`
- `webhook.respond`

## Approvals

Approvals are persisted run state. They are useful for operator control, but they are not an authorization boundary between mutually untrusted users.

Unattended approval behavior should fail closed unless a schedule or custom runner explicitly pauses for operator review.

## SQLite

Keep the SQLite file on local storage with user-only permissions. Anyone who can edit state can alter runs, schedules, webhooks, approvals, and stored key-value data.
