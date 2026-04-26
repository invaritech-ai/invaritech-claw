# Feature Implementation Plan: iclaw Phase 0 — dependency inventory (no behavior change)

**Goal:** Produce a single ground-truth inventory of how the operator TUI talks to the gateway (local vs remote), which gateway RPC methods the TUI requires, where cron and canvas/A2UI attach to the gateway, how bundled `extensions/*` partition into channels vs providers vs other, and which sub-agent modules and tests are load-bearing for the hard fork. Phase 0 is documentation and verification only: **no intentional product behavior changes**.

**Architecture:** The deliverable is Markdown (this plan’s completed checklists + a short **inventory appendix** you can keep in the same file or split to `docs/superpowers/iclaw-phase-0-inventory.md`). Optional: a small script or one-off command output pasted into the appendix for extension taxonomy—still inventory, not feature work.

**Tech Stack:** Repository sources only; `rg`/`pnpm` for discovery. No new runtime dependencies required.

**Testing:** Phase 0 does not introduce failing tests. Exit bar is: all checkboxes done, appendix filled with file references (repo-root paths like `src/tui/gateway-chat.ts`), and a short “open questions / decisions” subsection aligned with `docs/superpowers/plans/2026-04-26-iclaw-hard-fork-design.md`.

**Plan execution:** One agent can complete this in a focused session. Parallel work is optional (e.g. one pass on `extensions/*` manifests while another traces TUI).

**Completed (subagent-driven):** Filled inventory lives in [`../iclaw-phase-0-inventory.md`](../iclaw-phase-0-inventory.md). Orchestration used **three parallel read-only explore subagents** (Tasks 1–2, 3–4, 5–6) plus parent-session merge for Tasks 7–9 — avoiding parallel doc writers per `subagent-driven-development` red flags.

---

## Brainstorming note (condensed)

**Why inventory first:** Later phases remove UI surfaces and providers; wrong cuts strand the TUI or cron. A written map reduces rework.

**Deliverable shape:** (A) narrative + tables is mandatory. (B) Machine-readable extension list is optional if Phase 1 wants automation. (C) Mermaid for TUI ↔ gateway ↔ HTTP is optional. This plan requires (A); (B) and (C) are stretch.

**Scope guard:** If you find bugs while inventorying, log them; do not expand Phase 0 into fixes unless explicitly unblocked.

---

## Task 1: Document TUI ↔ gateway topology

**Overview:** Record the two ways the TUI runs against gateway logic: **embedded (local)** vs **WebSocket client (remote gateway)**.

**Steps:**

- [x] Read `src/cli/tui-cli.ts` and note CLI flags that force embedded mode (`--local`, `terminal`/`chat` entrypoints) vs remote (`--url`, token/password) and mutual exclusion rules.
- [x] Read `src/tui/tui.ts` (or equivalent orchestration) and document how `EmbeddedTuiBackend` vs `GatewayChatClient` is selected.
- [x] Read `src/tui/tui-backend.ts` and list the `TuiBackend` surface area (methods/events) that any future slim gateway must still satisfy for the TUI.
- [x] Read `src/tui/embedded-backend.ts` and list **every** `src/gateway/**` (and related) module it imports; this is the embedded coupling set.
- [x] Read `src/infra/embedded-mode.ts` (or `embedded-mode.js`) and note what `setEmbeddedMode` toggles for callers.

**Acceptance:** Appendix subsection “TUI modes” with a small table: Mode | Entry | Backend class | Key files.

---

## Task 2: List gateway RPC methods required by remote TUI

**Overview:** Remote TUI uses `GatewayClient` in `src/tui/gateway-chat.ts`. Inventory must match code, not guesswork.

**Steps:**

- [x] Grep `src/tui/gateway-chat.ts` for `this.client.request(` and record each method string.
- [x] For each method, note purpose in one line (e.g. `chat.send` → send message with idempotency key).
- [x] Record `GatewayClient` constructor options from the same file: `clientName`, `mode`, `caps`, `minProtocol`/`maxProtocol`, and event hooks (`onHelloOk`, `onEvent`, `onClose`, `onGap`).
- [x] Cross-check `src/gateway/protocol/` (or schema barrels) that these method names are defined/handled server-side, and note the implementing handler module if easy to find (e.g. under `src/gateway/server-methods/`).

**Known starting set (verify in tree):** `chat.send`, `chat.abort`, `chat.history`, `sessions.list`, `agents.list`, `sessions.patch`, `sessions.reset`, `status`, `models.list`.

**Acceptance:** Appendix table “TUI → gateway RPC” with columns: Method | Params of note | Server handler location (file:line or file only).

---

## Task 3: Map cron integration

**Overview:** Cron is part of the “slim gateway” scope; know where it registers and how it appears on the wire.

**Steps:**

- [x] Read `src/gateway/server-methods.ts` (or `.js`) and confirm how `cronHandlers` from `src/gateway/server-methods/cron.ts` (or `.js`) is merged.
- [x] Read `src/gateway/server-methods/cron.ts` and list exported RPC method names and side effects (read-only description).
- [x] Skim `src/gateway/protocol/schema/cron.ts` (or re-export path in `src/gateway/protocol/schema.ts`) for request/response shapes worth noting.
- [x] Grep `src/gateway/server-broadcast.ts` (and related) for `cron` scope or event names tied to cron.
- [x] Locate any `src/cron/**` (or job runner) modules the gateway invokes; list call path gateway → cron.

**Acceptance:** Appendix subsection “Cron” with RPC list + file references + one sentence on broadcast/events.

---

## Task 4: Map canvas / A2UI / control UI HTTP

**Overview:** Hard fork keeps canvas; inventory must separate **canvas host static + WS** from **control UI** routes.

**Steps:**

- [x] Read `src/canvas-host/a2ui.js` (or entry) for path constants and how the bundle is served.
- [x] Read `src/gateway/server/http-auth.ts` (or equivalent) for `A2UI_PATH`, `CANVAS_HOST_PATH`, `CANVAS_WS_PATH` usage.
- [x] Read `src/gateway/control-ui.ts` and `src/gateway/control-ui-routing.ts` for routes that are **operator web UI** vs canvas-only.
- [x] Read `src/gateway/server.canvas-auth.test.ts` (and any `*canvas*` tests) and note what auth modes are assumed for canvas endpoints.
- [x] Record which pieces are strictly required if **TUI-only** operator UI is the end state (decision text, even if “TBD pending Phase N”).

**Acceptance:** Appendix subsection “Canvas & HTTP surfaces” with bullet list: path | purpose | auth | keep/slim/remove (TBD allowed with rationale).

---

## Task 5: Bundled extensions taxonomy

**Overview:** Enumerate `extensions/*` and classify each package for later stripping (channel plugin vs provider vs other).

**Steps:**

- [x] List top-level directories under `extensions/`.
- [x] For each extension, read `package.json` and manifest (e.g. `openclaw.extension.json` / `manifest.json` / plugin manifest path used in repo—follow local convention).
- [x] Classify: **channel**, **provider**, **tool-only**, **memory**, **other** (define “other” when used).
- [x] Note declared `id` / plugin id used in config and registry.
- [ ] Optional stretch: emit a CSV or JSON array and paste path to artifact in appendix (file in repo only if team wants it tracked; otherwise paste in appendix).

**Acceptance:** Appendix table with one row per extension: Directory | Package name | Kind | Manifest id | Notes (e.g. “uses network”, “core tests import api.ts”).

---

## Task 6: Sub-agent preservation map

**Overview:** Sub-agents are required in the hard fork; Phase 0 lists seams so nothing critical is deleted in later phases.

**Steps:**

- [x] List primary modules under `src/agents/` matching `subagent*` (e.g. `subagent-registry.ts`, `subagent-spawn.ts`, `subagent-control*.ts`).
- [x] Read `src/agents/tools/subagents-tool.ts` and note gateway or protocol dependencies.
- [x] Read `src/agents/test-helpers/subagent-gateway.ts` and list what it stubs/proves.
- [x] Grep `src/gateway/` for `subagent` references and record integration points.
- [x] List test files `**/*subagent*.test.ts` (or similar) worth treating as regression anchors.

**Acceptance:** Appendix subsection “Sub-agents — do not delete without review” with file list grouped: core logic | tools | tests | gateway touchpoints.

---

## Task 7: Reconcile open questions from the hard fork design

**Overview:** Close or explicitly carry forward decisions from `docs/superpowers/plans/2026-04-26-iclaw-hard-fork-design.md` Phase 0 / open questions.

**Steps:**

- [x] Copy unresolved bullets from the design doc into the appendix.
- [x] For each, add either **Decision** (with owner/date if known) or **Still open — blocker for Phase N**.
- [x] Pay special attention to: control UI vs canvas-only routes; memory plugins scope; anything that affects gateway HTTP surface.

**Acceptance:** “Decisions & open questions” subsection with no empty placeholders—every item has status text.

---

## Task 8: Verification commands (repeatable)

**Overview:** Anyone re-running Phase 0 should get the same lists quickly.

**Steps:**

- [x] Record in appendix the exact `rg` patterns used (e.g. `rg 'this\\.client\\.request\\(' src/tui`).
- [x] Note `pnpm` commands that validate nothing regressed if you touch docs only (e.g. `pnpm check:changed` scope guidance: docs-only may skip full gate—follow team practice).

**Acceptance:** “Verification” mini-section with copy-paste commands and expected outcome (“non-empty hits”, “N files”, etc.).

---

## Task 9: Phase 0 exit checklist

- [x] All tasks above checked off (optional CSV/JSON stretch remains unchecked).
- [x] Inventory committed in [`../iclaw-phase-0-inventory.md`](../iclaw-phase-0-inventory.md) (docs-only delta).
- [x] No unrelated code changes in Phase 0.
- [x] Hard-fork Phase 0 row links to this plan; inventory links to design doc.

---

## Inventory appendix

**Filled inventory:** [`../iclaw-phase-0-inventory.md`](../iclaw-phase-0-inventory.md) (single source of truth). Update that file if Phase 0 facts change; keep this plan as the task checklist.
