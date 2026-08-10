# OpenClaw TUI Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the original OpenClaw terminal UI feel for `iclaw tui` while preserving the current simplified thread/API backend.

**Architecture:** Port the old OpenClaw pi-tui presentation layer back as local `iclaw` UI components, then replace the current Ink fullscreen runner with a thin adapter over `FullscreenTuiState` and `NativeOperatorApiClient`. Keep current thread commands, prompt submission, memory, context, compaction, and embedded local server behavior.

**Tech Stack:** TypeScript ESM, `@mariozechner/pi-tui`, `chalk`, existing `NativeOperatorApiClient`, existing `FullscreenTuiState`, Vitest, pnpm scripts.

---

## File Structure

- Modify `package.json`: replace Ink/React terminal UI dependencies with `@mariozechner/pi-tui` and `chalk`.
- Modify `pnpm-lock.yaml`: regenerate with `pnpm install`.
- Create `src/tui/theme/theme.ts`: restored OpenClaw palette and markdown/editor theme.
- Create `src/tui/osc8-hyperlinks.ts`: restored terminal hyperlink helper.
- Create `src/tui/components/hyperlink-markdown.ts`: markdown wrapper that adds OSC 8 links.
- Create `src/tui/components/markdown-message.ts`: shared markdown message base component.
- Create `src/tui/components/assistant-message.ts`: assistant markdown renderer.
- Create `src/tui/components/user-message.ts`: user message renderer.
- Create `src/tui/components/custom-editor.ts`: restored editor key handling.
- Create `src/tui/components/chat-log.ts`: simplified restored chat log for user, assistant, and system messages.
- Create `src/tui/fullscreen/view.ts`: pure formatting and state-to-chat-log sync helpers.
- Modify `src/tui/fullscreen/run.ts`: replace Ink renderer with pi-tui runner.
- Delete `src/tui/fullscreen/components.ts`: obsolete Ink/React app.
- Modify `test/tui/fullscreen-render.test.ts`: target restored formatting helpers.
- Add `test/tui/osc8-hyperlinks.test.ts`: URL extraction and hyperlink rendering coverage.

## Task 1: Dependencies

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [x] **Step 1: Edit dependencies**

Change `package.json` dependencies from:

```json
"dependencies": {
  "express": "^5.2.1",
  "ink": "^6.0.1",
  "json5": "^2.2.3",
  "react": "^19.2.3",
  "zod": "^4.3.6"
}
```

to:

```json
"dependencies": {
  "@mariozechner/pi-tui": "0.70.2",
  "chalk": "^5.6.2",
  "express": "^5.2.1",
  "json5": "^2.2.3",
  "zod": "^4.3.6"
}
```

Remove `@types/react` from `devDependencies`.

- [x] **Step 2: Regenerate lockfile**

Run: `pnpm install`

Expected: lockfile includes `@mariozechner/pi-tui` and no direct `ink`, `react`, or `@types/react` importer entries.

## Task 2: Restore Core UI Components

**Files:**

- Create: `src/tui/theme/theme.ts`
- Create: `src/tui/osc8-hyperlinks.ts`
- Create: `src/tui/components/hyperlink-markdown.ts`
- Create: `src/tui/components/markdown-message.ts`
- Create: `src/tui/components/assistant-message.ts`
- Create: `src/tui/components/user-message.ts`
- Create: `src/tui/components/custom-editor.ts`
- Create: `src/tui/components/chat-log.ts`
- Add: `test/tui/osc8-hyperlinks.test.ts`

- [x] **Step 1: Write hyperlink tests**

Add tests for extracting markdown and bare URLs and adding OSC 8 links.

- [x] **Step 2: Port hyperlink helper**

Port `src/tui/osc8-hyperlinks.ts` from commit `200be52d7a`.

- [x] **Step 3: Port theme and message components**

Port the restored theme and message components, removing old imports from `shared/string-coerce`, `terminal/ansi`, old tool display helpers, and old gateway types.

- [x] **Step 4: Run focused tests**

Run: `pnpm test -- --run test/tui/osc8-hyperlinks.test.ts`

Expected: PASS.

## Task 3: Add Fullscreen View Adapter

**Files:**

- Create: `src/tui/fullscreen/view.ts`
- Modify: `test/tui/fullscreen-render.test.ts`

- [x] **Step 1: Add formatting tests**

Assert that the restored view helper formats:

- header with product, thread, model, provider, server
- footer with context, summary, recent, memory, activity
- messages in role order
- panel/error as system entries

- [x] **Step 2: Implement helper**

Implement pure helpers:

```ts
export type FullscreenRenderableMessage = {
  kind: "assistant" | "user" | "system";
  text: string;
};

export function formatFullscreenHeader(state: FullscreenTuiState): string;
export function formatFullscreenFooter(state: FullscreenTuiState): string;
export function buildFullscreenRenderableMessages(
  state: FullscreenTuiState,
): FullscreenRenderableMessage[];
```

- [x] **Step 3: Run focused tests**

Run: `pnpm test -- --run test/tui/fullscreen-render.test.ts`

Expected: PASS.

## Task 4: Replace Ink Runner

**Files:**

- Modify: `src/tui/fullscreen/run.ts`
- Delete: `src/tui/fullscreen/components.ts`
- Modify: `src/cli/main.ts` only if the runner signature changes

- [x] **Step 1: Write/adjust CLI test expectation**

Keep `iclaw tui` calling `runFullscreenOperatorConsole` for chat view. The CLI test should continue to assert that embedded local server startup uses the fullscreen runner path.

- [x] **Step 2: Implement pi-tui runner**

Use `TUI`, `ProcessTerminal`, `Container`, `Text`, `Loader`, restored `ChatLog`, and `CustomEditor`. Submit prompts through `submitFullscreenPrompt`; submit slash commands through `beginFullscreenCommand` and `runFullscreenCommand`.

- [x] **Step 3: Remove Ink app**

Delete `src/tui/fullscreen/components.ts` after the new runner compiles.

- [x] **Step 4: Run typecheck**

Run: `pnpm tsgo`

Expected: PASS.

## Task 5: Verify Repo Gate

**Files:**

- All changed files

- [x] **Step 1: Run tests**

Run: `pnpm test`

Expected: PASS.

- [x] **Step 2: Run changed gate**

Run: `pnpm check:changed`

Expected: PASS.

- [x] **Step 3: Report changes**

Summarize restored OpenClaw UI components, removed Ink path, and any test limitations.

## Self-Review

Spec coverage:

- Restores OpenClaw UI elements: Tasks 2 and 4.
- Preserves current backend features: Task 4 uses existing `FullscreenTuiState` and `NativeOperatorApiClient`.
- Avoids old runtime complexity: file structure excludes old gateway/event/session handlers.
- Tests restored behavior: Tasks 2, 3, and 5.

Placeholder scan:

- No `TBD`.
- No `TODO`.
- No "implement later".

Type consistency:

- `FullscreenRenderableMessage`, `formatFullscreenHeader`, `formatFullscreenFooter`, and `buildFullscreenRenderableMessages` are defined in Task 3 and consumed in Task 4.
