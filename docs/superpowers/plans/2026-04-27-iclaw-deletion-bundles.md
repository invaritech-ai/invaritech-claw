# iclaw deletion bundles — design

> **See also:** [`2026-04-26-iclaw-hard-fork-design.md`](./2026-04-26-iclaw-hard-fork-design.md) (product/architecture contract), [`iclaw-rebrand-checklist.md`](./iclaw-rebrand-checklist.md) (rename phases), [`../iclaw-phase-0-inventory.md`](../iclaw-phase-0-inventory.md) (ground-truth inventory).

**Status:** Approved direction — proceed to implementation plan via `writing-plans` skill.

**Strategy:** Aggressive parallel deletion in three bundles (option B from brainstorming). Each bundle ends green; one full `pnpm test` per bundle before commit.

---

## Goals

1. Remove every surface not aligned with the TUI-only, single-operator, Ollama+OpenRouter fork product.
2. Land in three commits sized so a failure points clearly at its bundle.
3. Preserve sub-agent core (`src/agents/subagent-*.ts`, `src/cron/isolated-agent/subagent-followup*.ts`) untouched.
4. Move the rebrand checklist (`@openclaw/*` → `@iclaw/*`, manifest filename) onto a smaller surface for a trivial follow-up.

## Non-goals

- Backwards compatibility with existing OpenClaw configs that reference deleted channels/providers — doctor must **fail closed** with iclaw-branded errors.
- Preserving canvas/A2UI for hypothetical future browser UIs (revive via `git revert` if ever needed).
- Mid-bundle micro-commits — each bundle is one commit after green gates.

---

## Verification gate (run before each bundle commit)

```bash
pnpm install
pnpm tsgo:core
pnpm lint:core
pnpm check:import-cycles
pnpm test:changed
pnpm test            # full sweep — bundle commits only
```

Sub-agent regression anchor (must not change across bundles):

```bash
rg -l 'subagent' src/ | wc -l    # capture baseline before Bundle 1
```

---

## Bundle 1 — Extension purge

Delete loosely coupled, manifest-discovered extensions. One commit, ~83 directories removed.

### Channels (26)

`bluebubbles`, `discord`, `feishu`, `google-meet`, `googlechat`, `imessage`, `irc`, `line`, `matrix`, `mattermost`, `microsoft` (speech), `msteams`, `nextcloud-talk`, `nostr`, `qa-channel`, `qqbot`, `signal`, `slack`, `synology-chat`, `telegram`, `tlon`, `twitch`, `voice-call`, `whatsapp`, `zalo`, `zalouser`

### Non-target providers (~49)

`alibaba`, `amazon-bedrock`, `amazon-bedrock-mantle`, `anthropic`, `anthropic-vertex`, `arcee`, `byteplus`, `chutes`, `cloudflare-ai-gateway`, `codex`, `comfy`, `copilot-proxy`, `deepgram`, `deepseek`, `elevenlabs`, `fal`, `fireworks`, `github-copilot`, `google`, `groq`, `huggingface`, `kilocode`, `kimi-coding`, `litellm`, `lmstudio`, `microsoft-foundry`, `minimax`, `mistral`, `moonshot`, `nvidia`, `openai`, `opencode`, `opencode-go`, `qianfan`, `qwen`, `runway`, `sglang`, `stepfun`, `synthetic`, `tencent`, `together`, `venice`, `vercel-ai-gateway`, `vllm`, `volcengine`, `voyage`, `vydra`, `xai`, `xiaomi`, `zai`

### Tool-only search/web (7)

`brave`, `duckduckgo`, `exa`, `firecrawl`, `perplexity`, `searxng`, `tavily`

### Media gen + voice (8 + 2 stray test files)

`image-generation-core`, `video-generation-core`, `speech-core`, `talk-voice`, `phone-control`, plus `extensions/music-generation-providers.live.test.ts`, `extensions/video-generation-providers.live.test.ts`

### Pairing/discovery (2)

`device-pair`, `bonjour`

### Niche / dev / heavy-dep extensions (7)

`lobster`, `acpx`, `open-prose`, `qa-lab`, `qa-matrix`, `skill-workshop`, `diagnostics-otel`

### Same-bundle cleanup

- `pnpm-workspace.yaml` workspace globs (likely already a glob).
- Vitest shard configs naming deleted extensions (heavy OpenAI/channel shards).
- `.github/labeler.yml` entries for deleted dirs + matching GitHub labels.
- Plugin-catalog tests asserting deleted ids.
- Lockfile regenerated via `pnpm install`.

### Kept extensions

`ollama`, `openrouter`, `browser`, `media-understanding-core`, `memory-core`, `memory-lancedb`, `memory-wiki`, `active-memory`, `thread-ownership`, `diffs`, `llm-task`, `openshell`, `tokenjuice`, `webhooks`, `shared`, `test-support`

### Risks

- Sub-agent test hooks inside `discord`, `feishu`, `matrix` die with the extensions — acceptable, core sub-agent code is in `src/`.
- Confirm `rg -l 'subagent' src/` is unchanged after the deletion.

---

## Bundle 2 — Apps, Control UI, src/channels purge

Touches core. Higher risk; inventory pinpoints exact files.

### Companion apps & desktop shells

- `apps/android/`, `apps/ios/`, `apps/macos/`, `Swabble/` — entire dirs.
- Drop `pnpm lint:apps` lane and CI workflows.
- Remove `apps/ios/version.json`, `pnpm ios:version:sync`, appcast workflow.
- Remove app version-bump entries from release scripts.

### Control UI / Canvas / A2UI HTTP surface (drop entirely)

- `src/canvas-host/` — entire dir.
- `src/gateway/control-ui.ts`, `src/gateway/control-ui-routing.ts`.
- `src/gateway/canvas-capability.ts`.
- `src/gateway/server-http.ts` — surgically remove `canvas-auth`, `a2ui`, `canvas-http` pipeline stages and Control UI routing. Keep operator auth + RPC + webhook ingress.
- `src/gateway/server/http-auth.ts` — drop `isCanvasPath`, `authorizeCanvasRequest`.
- Path constants `A2UI_PATH`, `CANVAS_HOST_PATH`, `CANVAS_WS_PATH`, `__openclaw__/cap` — gone.
- `server.canvas-auth.test.ts` and any `canvas-*.test.ts`.
- `src/canvas-host/a2ui/.bundle.hash` and bundle scripts.

### src/channels purge

- Trim, do not nuke. Channel core defines session-key/types used by sub-agents and cron — preserve those.
- Approach: keep a minimal "operator session" channel concept; remove all multi-channel routing, channel-broadcast manager, registry tests asserting deleted channels.
- Delete `iclaw channels` subcommand and tests.
- Doctor / config schema: narrow to "no-channel mode"; fail closed on unknown channel/provider ids.

### CLI / doctor / onboarding cleanup

- Onboard wizard: remove channel/provider picker; flow becomes workspace + ollama/openrouter creds + done.
- Doctor: delete checks for removed channels/providers; add fail-closed branch for unknown ids.

### Risks

- Embedded TUI imports `src/gateway/**` (chat-sanitize, session-utils, server-methods/chat) — those stay.
- Sub-agent files in `src/agents/subagent-*.ts` and `src/cron/isolated-agent/subagent-followup*.ts` — untouched.
- Run full `pnpm test` before commit.

---

## Bundle 3 — Slim gateway internals, repo-root junk, docs

### Gateway-internal trims

- `src/gateway/server-methods/` — drop handlers serving deleted surfaces (pairing, node device-pair, deleted-provider model catalog entries, control-ui-config endpoints).
- `src/gateway/method-scopes.ts` — drop scopes for deleted methods.
- `src/gateway/protocol/schema/` — drop schemas only used by deleted methods. Decide: bump or freeze `PROTOCOL_VERSION`.
- `src/gateway/server-broadcast.ts` — drop broadcasts for deleted events.
- Health/status: tighten output to gateway+cron+(no canvas) shape.
- Keep `src/gateway/managed-image-attachments.ts` (sub-agent dep).

### Repo-root junk

- `fix2.py`, `dream-diary-preview-v2.html`, `dream-diary-preview-v3.html`.
- `openclaw-path-alias-GIQGIl/`, `openclaw-path-alias-j92KtC/`.
- `C:\openclaw` (literal filename — accidental Windows path).
- `dist/`, `dist-runtime/` — gitignore + `git rm -r --cached`.
- Audit `Dockerfile.sandbox-browser`, `docker-setup.sh` for stale surfaces.
- `appcast.xml` (Sparkle macOS).
- `fly.toml`, `fly.private.toml` — drop unless Fly deploys are intended.

### Docs sweep

- Delete dirs: `docs/channels/`, `docs/web/`, `docs/platforms/`, `docs/nodes/`, `docs/automation/` (audit), WhatsApp images.
- Trim `docs/providers/` to ollama + openrouter only.
- Trim `docs/start/`, `docs/install/` to a single TUI quickstart.
- Rewrite `docs/index.md`, `README.md`, `VISION.md` to TUI + iclaw narrative.
- Regenerate `docs.json` (Mintlify nav).
- `CHANGELOG.md` — append single "Hard fork" entry; no history rewrite.

### Config / build cleanup

- `knip.config.ts` — drop entries for deleted packages.
- Vitest shard configs — drop deleted-extension shards.
- `.github/labeler.yml` — drop labels for deleted surfaces.
- `.github/workflows/` — drop apps/mobile workflows; collapse to ci, release, docs-check.
- `tsconfig` package-boundary refs — drop deleted packages.
- `scripts/codemods/` — keep iclaw rebrand codemods; drop channel-specific ones.

### Final acceptance gate

```bash
pnpm install
pnpm tsgo:prod
pnpm lint
pnpm check:import-cycles
pnpm check:architecture
pnpm test
pnpm build
pnpm iclaw doctor
pnpm iclaw tui --local      # boots into TUI with ollama provider
```

---

## Rebrand checklist status after Bundle 3

Phases 5–8 of [`iclaw-rebrand-checklist.md`](./iclaw-rebrand-checklist.md) become trivial codemods on a much smaller surface:

- Phase 5 — user-visible strings, `[openclaw]` log prefixes, docs sweep (mostly absorbed by Bundle 3 docs sweep).
- Phase 6 — `@openclaw/*` → `@iclaw/*` package scopes (only ~16 packages remain).
- Phase 7 — `openclaw.plugin.json` → `iclaw.plugin.json` (only kept extensions).
- Phase 8 — apps bundle IDs (N/A; apps deleted), CI/docs final pass.

These land as a **follow-up commit** after Bundle 3, not as a fourth bundle in this plan.

---

## Open / deferred

- **Memory plugins** — kept for now; fork design open question (`iclaw-phase-0-inventory.md` § Decisions). User flagged possible full replacement later. Not part of this deletion plan.
- **`PROTOCOL_VERSION` bump vs freeze** — decide during Bundle 3 server-methods trim.
- **Webhook plugin's HTTP ingress route** — confirm during Bundle 2 server-http surgery that the route stays alive after canvas/control-ui paths are removed.
