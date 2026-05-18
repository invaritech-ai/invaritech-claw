# iclaw Phase 0 — dependency inventory (ground truth)

**Status:** Phase 0 complete (inventory only; no product behavior changes in that phase).

**Product contract:** [`plans/2026-04-26-iclaw-hard-fork-design.md`](plans/2026-04-26-iclaw-hard-fork-design.md)

**Housekeeping:** Superseded planning files were removed per [`plans/2026-04-25-iclaw-artifact-cleanup.md`](plans/2026-04-25-iclaw-artifact-cleanup.md).

**How this was produced:** Subagent-driven development — three parallel **read-only** explore agents (Tasks 1–2, 3–4, 5–6), merged in the orchestration session with Tasks 7–9 applied here. Per `subagent-driven-development`, parallel **implementers** were not used to avoid doc merge conflicts.

---

## TUI ↔ gateway topology

### `TuiBackend` contract (`src/tui/tui-backend.ts`)

**Event frame**

- `TuiEvent`: `{ event: string; payload?: unknown; seq?: number }`
- **Callbacks the backend may invoke:** `onEvent?(evt: TuiEvent)`, `onConnected?()`, `onDisconnected?(reason: string)`, `onGap?(info: { expected: number; received: number })`
- **Connection display:** `connection: { url: string; token?: string; password?: string }`
- **Lifecycle:** `start()`, `stop()`

**Operations a slim remote gateway must implement (same surface as `TuiBackend`)**

- `sendChat(opts: ChatSendOptions) → Promise<{ runId: string }>`
- `abortChat({ sessionKey, runId }) → Promise<{ ok: boolean; aborted: boolean }>`
- `loadHistory({ sessionKey, limit? }) → Promise<unknown>`
- `listSessions(opts?: SessionsListParams) → Promise<TuiSessionList>`
- `listAgents() → Promise<TuiAgentsList>`
- `patchSession(opts: SessionsPatchParams) → Promise<SessionsPatchResult>`
- `resetSession(key, reason?: "new" | "reset") → Promise<unknown>`
- `getGatewayStatus() → Promise<unknown>`
- `listModels() → Promise<TuiModelChoice[]>`

### CLI entry and mutual exclusion (`src/cli/tui-cli.ts`)

- **Flags:** `--local` (default false), `--url`, `--token`, `--password`, plus session/deliver/thinking/message/timeout/history-limit, etc.
- **Local detection:** `isLocal = Boolean(opts.local) ||` subcommand was `terminal` or `chat` (aliases).
- **Mutual exclusion:** if local is true **and** any of `--url`, `--token`, `--password` is set → error: `--local cannot be combined with --url, --token, or --password`.

### Backend choice (`src/tui/tui.ts`)

- `opts.local === true` → `new EmbeddedTuiBackend()`.
- Else → `await GatewayChatClient.connect({ url, token, password, ... })` returning `GatewayChatClient`.
- The unified handle is `const client: TuiBackend = ...` then `client.start()` after UI setup.

### `setEmbeddedMode` (`src/infra/embedded-mode.ts`)

- `setEmbeddedMode(value: boolean)` sets a private module flag `_embeddedMode`.
- `isEmbeddedMode()` returns that flag (used elsewhere to detect embedded TUI runs).

### Imports from `src/gateway/**` in `src/tui/embedded-backend.ts`

- `src/gateway/chat-sanitize.js`
- `src/gateway/cli-session-history.js`
- `src/gateway/protocol/index.js` (type `SessionsPatchResult`)
- `src/gateway/server-constants.js`
- `src/gateway/server-methods/agent-timestamp.js`
- `src/gateway/server-methods/chat.js`
- `src/gateway/server-model-catalog.js`
- `src/gateway/session-reset-service.js`
- `src/gateway/session-utils.fs.js`
- `src/gateway/session-utils.js`
- `src/gateway/sessions-patch.js`

### TUI modes

| Mode                       | Entry / flags                                                                                                               | Backend class        | Key files                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| Local embedded             | `tui --local`, or `terminal` / `chat` aliases (treated as local). Cannot use `--url` / `--token` / `--password` with local. | `EmbeddedTuiBackend` | `src/cli/tui-cli.ts`, `src/tui/tui.ts`, `src/tui/embedded-backend.ts`, `src/infra/embedded-mode.ts` |
| Remote (WebSocket gateway) | `tui` without local mode; optional `--url`, `--token`, `--password` (config/env resolution in `resolveGatewayConnection`).  | `GatewayChatClient`  | `src/cli/tui-cli.ts`, `src/tui/tui.ts`, `src/tui/gateway-chat.ts`, `src/gateway/client.ts`          |

### Embedded coupling (summary)

- The embedded path **imports and reuses** session store, history sanitization/caps, model catalog, session reset, and sessions patch behavior from `src/gateway/**` in-process instead of RPC.
- Chat turns are executed via **`agentCommandFromIngress`** (see `src/tui/embedded-backend.ts` and the agent-command path), not the gateway `chat.send` WebSocket method.
- Streaming to the TUI uses **`onAgentEvent`** from `src/infra/agent-events.js` and re-emits **`chat` / `agent` / `chat.side_result`-shaped** events, aligned with the remote client’s event handling in `src/tui/tui.ts`.
- **`setEmbeddedMode(true/false)`** in `start()` / `stop()` and **silent `defaultRuntime` overrides** keep embedded runs from polluting the terminal UI.

---

## TUI → gateway RPC (remote mode)

### `GatewayClient` options (`src/tui/gateway-chat.ts`)

- **`clientName`:** `GATEWAY_CLIENT_NAMES.TUI`
- **`clientDisplayName`:** `"openclaw-tui"` (rebrand to iclaw string is out of scope for Phase 0 inventory)
- **`clientVersion`:** `VERSION` from `src/version.js`
- **`platform`:** `process.platform`
- **`mode`:** `GATEWAY_CLIENT_MODES.UI`
- **`deviceIdentity`:** `null` when `allowInsecureLocalOperatorUi`, else `undefined`
- **`caps`:** `[GATEWAY_CLIENT_CAPS.TOOL_EVENTS]`
- **`instanceId`:** `randomUUID()`
- **`minProtocol` / `maxProtocol`:** `PROTOCOL_VERSION` (both equal)
- **Hooks:** `onHelloOk` → store hello, resolve ready, `onConnected`; `onEvent` → forward; **`onClose`** on `GatewayClient` → new ready promise, `onDisconnected(reason)`; **`onGap`** → `onGap`

### RPC methods

| Method           | Purpose                                                                 | Server handler                                                       |
| ---------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `chat.send`      | Start an agent/chat turn for a session (idempotency key = run id).      | `src/gateway/server-methods/chat.ts` (`"chat.send"` ~2037)           |
| `chat.abort`     | Abort an in-flight chat run for a session/run id.                       | `src/gateway/server-methods/chat.ts` (`"chat.abort"` ~1956)          |
| `chat.history`   | Load transcript/history for a session (startup retry on `UNAVAILABLE`). | `src/gateway/server-methods/chat.ts` (`"chat.history"` ~1874)        |
| `sessions.list`  | List sessions (filters via `SessionsListParams`).                       | `src/gateway/server-methods/sessions.ts` (`"sessions.list"`)         |
| `sessions.patch` | Patch session config/state in the gateway session store.                | `src/gateway/server-methods/sessions.ts` (`"sessions.patch"`)        |
| `sessions.reset` | Reset or start-new session for a key.                                   | `src/gateway/server-methods/sessions.ts` (`"sessions.reset"`)        |
| `agents.list`    | List agents and default/main scope metadata.                            | `src/gateway/server-methods/agents.ts` (`"agents.list"`)             |
| `models.list`    | List models; client uses `res.models` array.                            | `src/gateway/server-methods/models.ts` (`"models.list"`)             |
| `status`         | Gateway/status summary (TUI status line).                               | `src/gateway/server-methods/health.ts` (`status` / `healthHandlers`) |

---

## Cron

- **Merge into gateway RPC dispatch:** `cronHandlers` is imported in `src/gateway/server-methods.ts` and spread into `coreGatewayHandlers` (`...cronHandlers`) alongside other handler maps.
- **RPC methods** (`src/gateway/server-methods/cron.ts`):
  - **`wake`** — validate wake params then `context.cron.wake({ mode, text })`.
  - **`cron.list`** — Paginated job list, `deliveryPreviews` from `src/cron/delivery-preview.js`, current config.
  - **`cron.status`** — `context.cron.status()` snapshot.
  - **`cron.add`** — Create/schedule job, `context.cron.add`.
  - **`cron.update`** — `context.cron.update` with validation.
  - **`cron.remove`** — `context.cron.remove` by `id` / `jobId`.
  - **`cron.run`** — `context.cron.enqueueRun` (`due` | `force`); invalid session target → soft `{ ok: true, ran: false, reason: "invalid-spec" }`.
  - **`cron.runs`** — Run log pages (all jobs or per-job via cron store paths).
- **Operator scopes** (`src/gateway/method-scopes.ts`): read — `cron.list`, `cron.status`, `cron.runs`; write — `wake`; admin — `cron.add`, `cron.update`, `cron.remove`, `cron.run`.
- **Protocol:** `src/gateway/protocol/schema/cron.ts`; re-exported from `src/gateway/protocol/schema.ts`; validators compiled in `src/gateway/protocol/index.ts`. **`wake`** uses wake params schema (e.g. `src/gateway/protocol/schema/agent.ts` / `validateWakeParams`).
- **Broadcast:** `src/gateway/server-broadcast.ts` maps event **`cron`** to read scope. `src/gateway/server-cron.ts` passes `onEvent: (evt) => params.broadcast("cron", evt, { dropIfSlow: true })` into `CronService`.
- **Gateway → `src/cron`:** `src/gateway/server-cron.ts` builds state with `CronService` from `src/cron/service.js`; `src/gateway/server-request-context.ts` exposes `context.cron` / `context.cronStorePath`; `src/gateway/server-runtime-services.ts` starts the scheduler (`activateGatewayScheduledServices` → `startGatewayCronWithLogging`). Handlers call `context.cron.*` and `src/cron/**` helpers from `server-methods/cron.ts`.

---

## Canvas / A2UI / control UI

**`src/canvas-host/a2ui.ts` (built as `a2ui.js`)**

- **Path constants:** `A2UI_PATH = "/__openclaw__/a2ui"`, `CANVAS_HOST_PATH = "/__openclaw__/canvas"`, `CANVAS_WS_PATH = "/__openclaw__/ws"`.
- **Bundle:** `resolveA2uiRoot` finds `index.html` + `a2ui.bundle.js`; `handleA2uiHttpRequest` serves GET/HEAD under `A2UI_PATH` (503 if assets missing).

**`src/gateway/server/http-auth.ts`**

- **`isCanvasPath`:** `A2UI_PATH`, `CANVAS_HOST_PATH`, `CANVAS_WS_PATH` (exact or prefix).
- **`authorizeCanvasRequest`:** Bearer via `authorizeHttpGatewayConnect`, or live WS client with matching **canvas capability** (TTL). Tailscale disallowed on this path per explore notes.

**Pipeline**

- **Canvas-only:** `src/gateway/server-http.ts` — stages **`canvas-auth`**, **`a2ui`**, **`canvas-http`** (`canvasHost.handleHttpRequest`). WS: `src/gateway/canvas-capability.ts` — prefix **`/__openclaw__/cap`**, query **`oc_cap`**.
- **Control UI:** `src/gateway/control-ui.ts`, `src/gateway/control-ui-routing.ts` — SPA, bootstrap `.../control-ui-config.json`, assistant media, avatar routes. `classifyControlUiRequest` in `control-ui-routing.ts` splits root vs `basePath` and health/plugin/api exceptions.

**`src/gateway/server.canvas-auth.test.ts`**

- Expect **401** without auth; capability must match **connected** WS client with non-expired `canvasCapability`. Expired/disconnected → **401**. Unscoped canvas paths need normal gateway token. Malformed cap path → **401**.

### Paths — TUI-only fork note

| Path                                   | Purpose                      | Auth                              | TUI-only fork                                                                                       |
| -------------------------------------- | ---------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/{controlUi.basePath}/` (often `/`)   | Control UI SPA               | Operator control-ui read gate     | **Remove** when product is TUI-only (no browser operator UI).                                       |
| `/__openclaw__/control-ui-config.json` | Control UI bootstrap JSON    | Same                              | **Remove** with Control UI.                                                                         |
| `/__openclaw__/assistant-media`        | Assistant media previews     | Operator auth                     | **Remove** with Control UI.                                                                         |
| `/{basePath}/avatar/{agentId}`         | Avatars                      | Operator auth                     | **Remove** with Control UI.                                                                         |
| `/__openclaw__/a2ui`                   | A2UI static bundle           | Canvas auth (token or capability) | **Keep** per slim-gateway canvas goal unless the surface-trimming phase drops all canvas consumers. |
| `/__openclaw__/canvas`                 | User canvas documents        | Canvas auth                       | **Keep** / **slim** per `canvasHost` usage in the surface-trimming phase.                           |
| `/__openclaw__/ws`                     | Canvas live reload / WS lane | Canvas auth                       | Tied to A2UI/canvas; drop only if canvas stack removed.                                             |
| `/__openclaw__/cap/<token>/...`        | Scoped canvas URLs           | Capability + live client          | **Keep** only if node-embedded canvas remains.                                                      |

---

## Extensions (`extensions/*`) taxonomy

**Convention:** `extensions/<dir>/openclaw.plugin.json` (plugin `id`). Supplementary `package.json` `"openclaw"` metadata. Manifest-only sibling dirs exist (e.g. `active-memory/`, `device-pair/`) without root `package.json`.

**`other`:** Not primarily channel, inference provider, agent tool plugin, or memory — discovery, sandbox, QA, webhooks, workspace libs, etc.

| Extension dir              | Package name                               | Kind      | Manifest id             | Notes                      |
| -------------------------- | ------------------------------------------ | --------- | ----------------------- | -------------------------- |
| `acpx`                     | `@openclaw/acpx`                           | other     | `acpx`                  | ACP embedded runtime       |
| `alibaba`                  | `@openclaw/alibaba-provider`               | provider  | `alibaba`               |                            |
| `amazon-bedrock`           | `@openclaw/amazon-bedrock-provider`        | provider  | `amazon-bedrock`        |                            |
| `amazon-bedrock-mantle`    | `@openclaw/amazon-bedrock-mantle-provider` | provider  | `amazon-bedrock-mantle` |                            |
| `anthropic`                | `@openclaw/anthropic-provider`             | provider  | `anthropic`             |                            |
| `anthropic-vertex`         | `@openclaw/anthropic-vertex-provider`      | provider  | `anthropic-vertex`      |                            |
| `arcee`                    | `@openclaw/arcee-provider`                 | provider  | `arcee`                 |                            |
| `bluebubbles`              | `@openclaw/bluebubbles`                    | channel   | `bluebubbles`           |                            |
| `bonjour`                  | `@openclaw/bonjour`                        | other     | `bonjour`               | mDNS discovery             |
| `brave`                    | `@openclaw/brave-plugin`                   | tool-only | `brave`                 |                            |
| `browser`                  | `@openclaw/browser-plugin`                 | tool-only | `browser`               |                            |
| `byteplus`                 | `@openclaw/byteplus-provider`              | provider  | `byteplus`              |                            |
| `chutes`                   | `@openclaw/chutes-provider`                | provider  | `chutes`                |                            |
| `cloudflare-ai-gateway`    | `@openclaw/cloudflare-ai-gateway-provider` | provider  | `cloudflare-ai-gateway` |                            |
| `codex`                    | `@openclaw/codex`                          | provider  | `codex`                 |                            |
| `comfy`                    | `@openclaw/comfy-provider`                 | provider  | `comfy`                 |                            |
| `copilot-proxy`            | `@openclaw/copilot-proxy-provider`         | provider  | `copilot-proxy`         |                            |
| `deepgram`                 | `@openclaw/deepgram-provider`              | provider  | `deepgram`              |                            |
| `deepseek`                 | `@openclaw/deepseek-provider`              | provider  | `deepseek`              |                            |
| `diagnostics-otel`         | `@openclaw/diagnostics-otel`               | other     | `diagnostics-otel`      |                            |
| `diffs`                    | `@openclaw/diffs`                          | tool-only | `diffs`                 |                            |
| `discord`                  | `@openclaw/discord`                        | channel   | `discord`               |                            |
| `duckduckgo`               | `@openclaw/duckduckgo-plugin`              | tool-only | `duckduckgo`            |                            |
| `elevenlabs`               | `@openclaw/elevenlabs-speech`              | provider  | `elevenlabs`            |                            |
| `exa`                      | `@openclaw/exa-plugin`                     | tool-only | `exa`                   |                            |
| `fal`                      | `@openclaw/fal-provider`                   | provider  | `fal`                   |                            |
| `feishu`                   | `@openclaw/feishu`                         | channel   | `feishu`                |                            |
| `firecrawl`                | `@openclaw/firecrawl-plugin`               | tool-only | `firecrawl`             |                            |
| `fireworks`                | `@openclaw/fireworks-provider`             | provider  | `fireworks`             |                            |
| `github-copilot`           | `@openclaw/github-copilot-provider`        | provider  | `github-copilot`        |                            |
| `google`                   | `@openclaw/google-plugin`                  | provider  | `google`                |                            |
| `google-meet`              | `@openclaw/google-meet`                    | tool-only | `google-meet`           |                            |
| `googlechat`               | `@openclaw/googlechat`                     | channel   | `googlechat`            |                            |
| `groq`                     | `@openclaw/groq-provider`                  | provider  | `groq`                  |                            |
| `huggingface`              | `@openclaw/huggingface-provider`           | provider  | `huggingface`           |                            |
| `image-generation-core`    | `@openclaw/image-generation-core`          | other     | —                       | Workspace lib; no manifest |
| `imessage`                 | `@openclaw/imessage`                       | channel   | `imessage`              |                            |
| `irc`                      | `@openclaw/irc`                            | channel   | `irc`                   |                            |
| `kilocode`                 | `@openclaw/kilocode-provider`              | provider  | `kilocode`              |                            |
| `kimi-coding`              | `@openclaw/kimi-provider`                  | provider  | `kimi`                  |                            |
| `line`                     | `@openclaw/line`                           | channel   | `line`                  |                            |
| `litellm`                  | `@openclaw/litellm-provider`               | provider  | `litellm`               |                            |
| `llm-task`                 | `@openclaw/llm-task`                       | tool-only | `llm-task`              |                            |
| `lmstudio`                 | `@openclaw/lmstudio-provider`              | provider  | `lmstudio`              |                            |
| `lobster`                  | `@openclaw/lobster`                        | tool-only | `lobster`               |                            |
| `matrix`                   | `@openclaw/matrix`                         | channel   | `matrix`                |                            |
| `mattermost`               | `@openclaw/mattermost`                     | channel   | `mattermost`            |                            |
| `media-understanding-core` | `@openclaw/media-understanding-core`       | other     | —                       | Workspace lib              |
| `memory-core`              | `@openclaw/memory-core`                    | memory    | `memory-core`           |                            |
| `memory-lancedb`           | `@openclaw/memory-lancedb`                 | memory    | `memory-lancedb`        |                            |
| `memory-wiki`              | `@openclaw/memory-wiki`                    | memory    | `memory-wiki`           |                            |
| `microsoft`                | `@openclaw/microsoft-speech`               | provider  | `microsoft`             |                            |
| `microsoft-foundry`        | `@openclaw/microsoft-foundry`              | provider  | `microsoft-foundry`     |                            |
| `minimax`                  | `@openclaw/minimax-provider`               | provider  | `minimax`               |                            |
| `mistral`                  | `@openclaw/mistral-provider`               | provider  | `mistral`               |                            |
| `moonshot`                 | `@openclaw/moonshot-provider`              | provider  | `moonshot`              |                            |
| `msteams`                  | `@openclaw/msteams`                        | channel   | `msteams`               |                            |
| `nextcloud-talk`           | `@openclaw/nextcloud-talk`                 | channel   | `nextcloud-talk`        |                            |
| `nostr`                    | `@openclaw/nostr`                          | channel   | `nostr`                 |                            |
| `nvidia`                   | `@openclaw/nvidia-provider`                | provider  | `nvidia`                |                            |
| `ollama`                   | `@openclaw/ollama-provider`                | provider  | `ollama`                | **Keep** (fork)            |
| `open-prose`               | `@openclaw/open-prose`                     | other     | `open-prose`            |                            |
| `openai`                   | `@openclaw/openai-provider`                | provider  | `openai`                |                            |
| `opencode`                 | `@openclaw/opencode-provider`              | provider  | `opencode`              |                            |
| `opencode-go`              | `@openclaw/opencode-go-provider`           | provider  | `opencode-go`           |                            |
| `openrouter`               | `@openclaw/openrouter-provider`            | provider  | `openrouter`            | **Keep** (fork)            |
| `openshell`                | `@openclaw/openshell-sandbox`              | other     | `openshell`             |                            |
| `perplexity`               | `@openclaw/perplexity-plugin`              | tool-only | `perplexity`            |                            |
| `qa-channel`               | `@openclaw/qa-channel`                     | channel   | `qa-channel`            |                            |
| `qa-lab`                   | `@openclaw/qa-lab`                         | other     | `qa-lab`                |                            |
| `qa-matrix`                | `@openclaw/qa-matrix`                      | other     | `qa-matrix`             |                            |
| `qianfan`                  | `@openclaw/qianfan-provider`               | provider  | `qianfan`               |                            |
| `qqbot`                    | `@openclaw/qqbot`                          | channel   | `qqbot`                 |                            |
| `qwen`                     | `@openclaw/qwen-provider`                  | provider  | `qwen`                  |                            |
| `runway`                   | `@openclaw/runway-provider`                | provider  | `runway`                |                            |
| `searxng`                  | `@openclaw/searxng-plugin`                 | tool-only | `searxng`               |                            |
| `sglang`                   | `@openclaw/sglang-provider`                | provider  | `sglang`                |                            |
| `signal`                   | `@openclaw/signal`                         | channel   | `signal`                |                            |
| `skill-workshop`           | `@openclaw/skill-workshop`                 | other     | `skill-workshop`        |                            |
| `slack`                    | `@openclaw/slack`                          | channel   | `slack`                 |                            |
| `speech-core`              | `@openclaw/speech-core`                    | other     | —                       | Workspace lib              |
| `stepfun`                  | `@openclaw/stepfun-provider`               | provider  | `stepfun`               |                            |
| `synology-chat`            | `@openclaw/synology-chat`                  | channel   | `synology-chat`         |                            |
| `synthetic`                | `@openclaw/synthetic-provider`             | provider  | `synthetic`             |                            |
| `tavily`                   | `@openclaw/tavily-plugin`                  | tool-only | `tavily`                |                            |
| `telegram`                 | `@openclaw/telegram`                       | channel   | `telegram`              |                            |
| `tencent`                  | `@openclaw/tencent-provider`               | provider  | `tencent`               |                            |
| `tlon`                     | `@openclaw/tlon`                           | channel   | `tlon`                  |                            |
| `together`                 | `@openclaw/together-provider`              | provider  | `together`              |                            |
| `tokenjuice`               | `@openclaw/tokenjuice`                     | other     | `tokenjuice`            |                            |
| `twitch`                   | `@openclaw/twitch`                         | channel   | `twitch`                |                            |
| `venice`                   | `@openclaw/venice-provider`                | provider  | `venice`                |                            |
| `vercel-ai-gateway`        | `@openclaw/vercel-ai-gateway-provider`     | provider  | `vercel-ai-gateway`     |                            |
| `video-generation-core`    | `@openclaw/video-generation-core`          | other     | —                       | Workspace lib              |
| `vllm`                     | `@openclaw/vllm-provider`                  | provider  | `vllm`                  |                            |
| `voice-call`               | `@openclaw/voice-call`                     | channel   | `voice-call`            |                            |
| `volcengine`               | `@openclaw/volcengine-provider`            | provider  | `volcengine`            |                            |
| `voyage`                   | `@openclaw/voyage-provider`                | provider  | `voyage`                |                            |
| `vydra`                    | `@openclaw/vydra-provider`                 | provider  | `vydra`                 |                            |
| `webhooks`                 | `@openclaw/webhooks`                       | other     | `webhooks`              |                            |
| `whatsapp`                 | `@openclaw/whatsapp`                       | channel   | `whatsapp`              |                            |
| `xai`                      | `@openclaw/xai-plugin`                     | provider  | `xai`                   |                            |
| `xiaomi`                   | `@openclaw/xiaomi-provider`                | provider  | `xiaomi`                |                            |
| `zai`                      | `@openclaw/zai-provider`                   | provider  | `zai`                   |                            |
| `zalo`                     | `@openclaw/zalo`                           | channel   | `zalo`                  |                            |
| `zalouser`                 | `@openclaw/zalouser`                       | channel   | `zalouser`              |                            |

**Non-package siblings (explore summary):** `active-memory/`, `device-pair/`, `phone-control/`, `thread-ownership/`, `talk-voice/` (manifest-only), `shared/`, `test-support/`, plus docs/config under `extensions/`. Re-audit when trimming the remaining extension surface in the later product-surface phases.

---

## Sub-agents — do not delete without review

### Core logic

Registry, spawn, depth, control, announce/delivery, session keys, cron helpers — see `src/agents/subagent-*.ts`, `src/auto-reply/reply/subagents-utils.ts`, `src/cron/isolated-agent/subagent-followup*.ts`, `src/shared/subagents-format.ts`, and `src/gateway/server-methods/subagent-followup.test-helpers.ts`.

### Tools

- `src/agents/tools/subagents-tool.ts` — `list` / `kill` / `steer`; uses `loadConfig`, `subagent-control`, `subagent-list`, schema/common. Kill/steer delegates to control layer (may reach gateway via `src/gateway/call.js` indirectly).
- `src/agents/test-helpers/subagent-gateway.ts` — `installAcceptedSubagentGatewayMock` stubs gateway client `request`: `agent` → `{ runId: "run-1" }`, `sessions.*` → `{ ok: true }`, else `{}`.

### Tests

**57** paths matching `*subagent*.test.ts` under `src/` and `extensions/` (per explore). Treat `src/agents/subagent-*.test.ts` and `src/gateway/server.*subagent*.test.ts` as regression anchors. Extension hooks: e.g. `extensions/discord`, `feishu`, `matrix` subagent hook tests.

### Gateway touchpoints (non-exhaustive file list)

`src/gateway/managed-image-attachments.ts`, `model-pricing-cache.ts`, `protocol/schema/sessions.ts`, `server-chat.ts`, `server-cron.test.ts`, `server-plugins.ts`, `server-session-events.ts`, `server-startup-plugins.ts`, `server-startup-post-attach.ts`, `server-methods.ts`, `server-methods/agent.ts`, `server-methods/chat.ts`, `server-methods/sessions.ts`, `session-kill-http.ts`, `session-reset-service.ts`, `session-subagent-reactivation*.ts`, `session-utils.ts`, `sessions-patch.ts`, `tool-resolution.ts`, and associated `*.test.ts` files referencing subagent sessions.

---

## Decisions & open questions (from hard-fork design)

Source: [`plans/2026-04-26-iclaw-hard-fork-design.md`](plans/2026-04-26-iclaw-hard-fork-design.md) § Open questions.

1. **Does TUI require a separately started gateway, or is there an embedded path?**  
   **Decision:** Both. **Remote:** `GatewayChatClient` over WebSocket (default when not `--local` and not `terminal`/`chat` alias). **Embedded:** `EmbeddedTuiBackend` with `--local` or those aliases; uses in-process `src/gateway/**` modules (no separate gateway process).

2. **Remove Control UI HTTP entirely vs keep only canvas/A2UI?**  
   **Decision (direction):** For **TUI-only product**, **remove** Control UI routes (SPA, bootstrap, assistant-media, avatar) in a later **slim gateway** phase. **Retain** `__openclaw__` canvas/A2UI/canvas-host paths per slim-gateway design until the surface-trimming phase narrows HTTP surface. Path renames (`__openclaw__` → `__iclaw__`) belong to rebrand phases, not Phase 0.

3. **Memory plugins (`memory-core`, etc.) — in or out for v1?**  
   **Still open — recommend a later product call.** Fork contract limits **providers** to Ollama + OpenRouter; memory plugins are not LLM providers. **Default:** keep inventory and defer “memory in/out” until provider and surface cleanup stabilizes; document dependency if agents rely on memory tools in your preset.

---

## Verification commands

```bash
# Remote TUI RPC surface (should list 9 request lines)
rg 'this\.client\.request\(' src/tui/gateway-chat.ts

# Chat handler keys (sanity)
rg '"chat\.(send|abort|history)"' src/gateway/server-methods/chat.ts

# Cron handlers merged into gateway
rg 'cronHandlers' src/gateway/server-methods.ts

# Canvas path constants
rg 'A2UI_PATH|CANVAS_HOST_PATH|CANVAS_WS_PATH' src/canvas-host src/gateway/server

# Subagent touchpoints in gateway
rg -l 'subagent' src/gateway | wc -l

# Extension manifests
find extensions -maxdepth 2 -name 'openclaw.plugin.json' | wc -l
```

**Docs-only change bar:** No `pnpm` gate strictly required for Markdown-only edits; use `pnpm check:changed` before push if you also touch TS.

---

## Phase 0 exit

- [x] Inventory sections 1–6 filled from code exploration (subagent + merge).
- [x] Decisions / open questions section complete (no empty placeholders).
- [x] Verification commands recorded.
- [x] Canonical doc: this file. (Historical task checklist file removed as duplicate; see artifact cleanup plan.)
