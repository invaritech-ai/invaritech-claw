---
summary: "Gateway HTTP and WebSocket routes, auth expectations, and exposure notes"
read_when:
  - Hardening gateway network exposure
  - Auditing auth on HTTP or WebSocket surfaces
title: "HTTP ingress matrix"
---

## Scope

This page summarizes **built-in** gateway HTTP request stages (see `src/gateway/server-http.ts`) and common **WebSocket** upgrade paths. Plugin-registered HTTP routes are not enumerated here; they follow plugin manifest metadata and may require gateway auth depending on path classification.

Classification:

- **Public**: No `gateway.auth` shared secret required for the described default behavior (still subject to bind address and other checks).
- **Authenticated**: Requires successful `authorizeHttpGatewayConnect` (token, password, trusted-proxy, etc.) or another documented gate (for example hook token).
- **High privilege**: Authenticated and treated as **operator-class** trust (for example shared-secret bearer on OpenAI-compatible APIs and `POST /tools/invoke`).

## HTTP routes (built-in)

| Path / pattern                                 | Methods            | Auth (typical)                            | Exposure notes                                                                                                                                                                                     |
| ---------------------------------------------- | ------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health`, `/healthz`                          | GET, HEAD          | Public                                    | Liveness; minimal payload.                                                                                                                                                                         |
| `/ready`, `/readyz`                            | GET, HEAD          | Public; **detail** gated                  | Returns `{ ok, status }` without internals. Readiness **details** (failing components, uptime) require loopback/direct local request or successful gateway auth when `gateway.auth` is not `none`. |
| Hooks base path (`hooks.basePath` from config) | POST               | Hook shared secret                        | Token only via `Authorization: Bearer` or `X-OpenClaw-Token` (query `?token=` rejected). Rate-limited on failures.                                                                                 |
| `/v1/models`, `/v1/models/{id}`                | GET                | Authenticated; high privilege with bearer | OpenAI-compatible surface when `gateway.http.endpoints` enable it.                                                                                                                                 |
| `/v1/embeddings`                               | POST               | Authenticated; high privilege with bearer | Same as above.                                                                                                                                                                                     |
| `/v1/chat/completions`                         | POST               | Authenticated; high privilege with bearer | Same as above.                                                                                                                                                                                     |
| `/v1/responses`                                | POST               | Authenticated; high privilege with bearer | OpenResponses surface when enabled.                                                                                                                                                                |
| `POST /tools/invoke`                           | POST               | Authenticated; high privilege with bearer | Same shared-secret trust model as compat APIs; invokes agent tools.                                                                                                                                |
| `/sessions/{id}/kill`                          | POST               | Authenticated                             | Session control HTTP surface.                                                                                                                                                                      |
| `/sessions/{id}/history`                       | GET                | Authenticated                             | Session history; streaming semantics documented per handler.                                                                                                                                       |
| Canvas host paths (`canvasHost`)               | varies             | Authenticated for canvas                  | Includes A2UI and static host paths under canvas configuration.                                                                                                                                    |
| Control UI (`gateway.controlUi.basePath`)      | GET (SPA + assets) | Authenticated                             | Non-loopback binds require `gateway.controlUi.allowedOrigins` or explicit host-header fallback flag.                                                                                               |
| Plugin HTTP routes                             | varies             | Often authenticated                       | Fail-closed for protected paths; some paths may be plugin auth-bypass (channel-specific).                                                                                                          |

## WebSocket upgrades

| Path / pattern                                          | Auth (typical)         | Notes                                                                                          |
| ------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| Control UI / gateway protocol (primary `wss`/`ws` URL)  | Gateway auth handshake | Pre-auth connection budget applies; exact path matches client URL (often `/ws` or configured). |
| Canvas WebSocket (`CANVAS_WS_PATH` and scoped variants) | Canvas authorization   | Validated on upgrade before accepting the socket.                                              |

## Bind and lean profile

- Default bind behavior is documented in [Configuration](/gateway/configuration): non-loopback binds require shared-secret auth (or trusted-proxy mode) before startup succeeds.
- **`ICLAW_LEAN_GATEWAY=1`** or **`ICLAW_MINIMAL_ASSISTANT=1`**: opt-in profiles that set `gateway.bind` to **loopback** when unset, seed `plugins.allow` when empty ( **`["ollama"]`** by default), and **reject** `gateway.auth` **mode=`none`** at startup. **`ICLAW_MINIMAL_ASSISTANT`** also limits bundled plugin **discovery** to Ollama unless `ICLAW_BUNDLED_PLUGIN_DIRS` is set. See `src/config/lean-gateway-profile.ts`, `src/plugins/bundled-discovery-filter.ts`, and `src/gateway/server-runtime-config.ts`.
- [Minimal assistant setup](/help/minimal-assistant)

## Related docs

- [Security overview](/gateway/security)
- [Gateway secrets](/gateway/secrets)
- [Tools invoke HTTP API](/gateway/tools-invoke-http-api)
- [OpenAI HTTP API](/gateway/openai-http-api)
