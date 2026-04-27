# iclaw hard fork — design (slim gateway, TUI-only, cron, canvas, sub-agents)

> **See also:** [`2026-04-25-iclaw-rebrand.md`](./2026-04-25-iclaw-rebrand.md) (rename/migration phases). This document is the **product/architecture** contract for a **hard fork**: aggressive deletion, not upstream parity.

**Status:** Approved direction — implementation should proceed in vertical phases with green gates per phase.

---

## Goals

1. **Hard fork** — Remove unused surfaces (especially **all messaging channels**). Accept permanent drift from OpenClaw upstream; merge only when explicitly chosen.
2. **Single operator UX** — **TUI only** (`iclaw tui` / aliases). No supported macOS menu app, WebChat, mobile nodes, or other control UIs as product features.
3. **Slim gateway** — Keep **one long-lived gateway process** that owns:
   - **Session + agent loop** (including **sub-agents** — spawn, routing, policy, isolation as implemented today),
   - **Cron**,
   - **Canvas + A2UI** HTTP on the gateway port (same model as today: WS + HTTP share bind).
4. **Models** — Only **Ollama** and **OpenRouter** as first-class providers; remove or refuse-load others at config/manifest boundaries.
5. **Naming** — **iclaw** everywhere: no `openclaw` in user-visible strings, identifiers you own (package names, plugin manifest filenames, npm scopes), or docs that describe _this_ product. External URLs to third-party sites may remain; references to the upstream project should be clearly labeled **upstream** if kept at all.

---

## Non-goals

- Parity with OpenClaw releases, channel plugins, or multi-client operator stories.
- Preserving install paths for removed apps (Android/iOS/macOS clients) unless you explicitly revive them later.
- “Minimal preset” that leaves dead extensions in-tree without shipping them — this fork **deletes** or **excludes from build** what is out of scope.

---

## Architecture

### Slim gateway (retain)

The gateway remains the **single hub process** on a host:

| Responsibility                               | Keep                                  | Notes                                                                                                                        |
| -------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| WebSocket control plane                      | **Yes** (until/unless TUI is inlined) | TUI likely stays a **client** of the gateway over loopback; verify in code before deleting WS surfaces.                      |
| HTTP: canvas / A2UI                          | **Yes**                               | Same-port HTTP as today; auth/bind rules stay aligned with `gateway.*` config.                                               |
| Cron                                         | **Yes**                               | Scheduler stays gateway-owned or gateway-adjacent as today.                                                                  |
| Session store + inference loop               | **Yes**                               | One **primary** session story for the operator; sub-agents are additional sessions or child runs **under the same gateway**. |
| Sub-agents                                   | **Yes**                               | Do **not** strip subagent registry, spawn paths, or tests without an explicit replacement design.                            |
| Messaging channels (WhatsApp, Telegram, …)   | **No**                                | Remove extensions and core channel wiring that exists only for those surfaces.                                               |
| Node / device pairing (mobile, multi-device) | **No** (product)                      | Remove or stub CLI and gateway methods that exist only for that story.                                                       |
| Extra UIs                                    | **No**                                | Control UI / WebChat / app shells: out of scope; code may be deleted or left unmaintained per phase plan.                    |

### TUI (only supported UI)

- **Only** documented and tested operator interface: terminal UI.
- CLI commands that exist only for removed surfaces (e.g. `channels`, DM pairing) should be removed or hidden in help as the fork matures.

### Providers

- **Ship / allow:** `extensions/ollama/`, `extensions/openrouter/` (and minimal shared deps they need).
- **Remove:** All other provider plugins from the fork (or move to an unpublishable `legacy/` tree if you need reference — default is **delete**).
- **Config:** Tighten schema and doctor so unknown providers **fail closed** (clear errors, no silent skip).

### Naming / packaging

- Replace **`openclaw.plugin.json`** with **`iclaw.plugin.json`** (and discovery) as a dedicated phase; align with rebrand plan Phase 7.
- Rename **`@openclaw/*`** workspace packages to **`@iclaw/*`** where this repo owns the name.
- Eliminate **`openclaw`** from: CLI name, log tags, state dir defaults (`docs/superpowers/plans/2026-04-25-iclaw-rebrand.md` Phase 4), env examples, Docker/CI, and internal strings except **explicit** “upstream OpenClaw” historical notes if you keep any.

---

## Phased implementation (high level)

Work in order; each phase ends with **install + typecheck + scoped tests** (full `pnpm test` before large deletes).

| Phase | Focus                                                                                                                                                                                                  | Exit bar                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| **0** | **Inventory** — Map TUI→gateway wire-up, sub-agent entrypoints, cron + canvas mount paths, bundled extension list. **Ground truth:** [`../iclaw-phase-0-inventory.md`](../iclaw-phase-0-inventory.md). | Filled inventory; no behavior change.         |
| **1** | **Rebrand identifiers** — iclaw package/manifest/env/paths per existing rebrand plan; grep gate: no `openclaw` in owned surfaces.                                                                      | `pnpm check:changed` / targeted tests.        |
| **2** | **Remove all channel extensions + channel CLI/doctor** — Delete `extensions/<channel>/`, trim `src/channels/**` to minimum (or stub no-channel mode).                                                  | Tests updated; no channel catalog entries.    |
| **3** | **Providers: Ollama + OpenRouter only** — Delete other provider extensions; narrow discovery and config validation.                                                                                    | Doctor + config tests; model list tests.      |
| **4** | **Slim gateway** — Remove gateway methods, pairing, and status tables that only served nodes/channels; keep cron, canvas, agent, sub-agents.                                                           | Gateway integration tests + TUI smoke.        |
| **5** | **Apps & CI** — Drop or freeze mobile/desktop apps; simplify Docker, workflows, extension test shards.                                                                                                 | CI green; docs reflect TUI-only.              |
| **6** | **Final grep + docs** — Single-source operator doc: install, `iclaw gateway`, `iclaw tui`, cron, canvas, providers.                                                                                    | Human review + full test sweep when feasible. |

---

## Risks

- **Accidentally removing sub-agents** while deleting “channel” or “multi-session” code — Phase 0 must name files/modules to preserve.
- **TUI coupling** — If TUI assumes specific gateway RPCs, slimming the gateway must preserve that **contract** or update TUI in the same PR.
- **Config migration** — Existing configs with removed channels/providers should **fail loudly** with iclaw-branded doctor messages, not corrupt state.
- **Upstream merge** — Effectively zero; treat as permanent fork unless you cherry-pick deliberately.

---

## Open questions (resolve in Phase 0)

**Resolutions:** See [`../iclaw-phase-0-inventory.md`](../iclaw-phase-0-inventory.md) § _Decisions & open questions_.

1. Does **TUI** require a **separately started** `iclaw gateway`, or is there an embedded path today? (Docs + `src/cli/tui-cli` / gateway client.)
2. Should **Control UI** HTTP routes be removed entirely, or kept **only** for canvas/A2UI paths?
3. **Memory plugins** (`memory-core`, etc.) — in or out for v1 of the fork?

---

## Approval

This design matches the agreed direction: **hard fork**, **slim gateway** (cron + canvas + agent + sub-agents), **TUI-only** operator UI, **Ollama + OpenRouter** only, **iclaw** naming. Implementation should follow phased table above; detailed task breakdown can live in a separate implementation plan (checkbox format) derived from this file.
