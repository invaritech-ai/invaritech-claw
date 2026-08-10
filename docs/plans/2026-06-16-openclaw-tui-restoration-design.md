# OpenClaw TUI Restoration Design

## Context

`iclaw` kept the right backend direction: a small TypeScript package, SQLite state, a loopback HTTP API, thread-native commands, OpenRouter and Ollama providers, memory, context preview, and compaction.

The TUI diverged from that direction. The current fullscreen TUI is a new Ink/React surface under `src/tui/fullscreen/`. It recreates basic terminal layout from scratch and does not reuse the OpenClaw terminal UI kit that existed before `cac2131e10 refactor: trim iclaw to v1 headless surface`.

The reusable OpenClaw UI lives in earlier history, especially commit `200be52d7a`. Important deleted pieces:

- `src/tui/components/chat-log.ts`
- `src/tui/components/assistant-message.ts`
- `src/tui/components/user-message.ts`
- `src/tui/components/markdown-message.ts`
- `src/tui/components/hyperlink-markdown.ts`
- `src/tui/components/custom-editor.ts`
- `src/tui/theme/theme.ts`
- `src/tui/osc8-hyperlinks.ts`
- selected terminal lifecycle and status-line behavior from `src/tui/tui.ts`

## Goal

Restore the original OpenClaw terminal feel while keeping the simplified `iclaw` backend and current thread features.

## Non-Goals

- Do not restore the old gateway runtime.
- Do not restore old agents/session routing.
- Do not restore old local shell execution.
- Do not restore tool streaming UI until `iclaw` has a thread-native tool execution model.
- Do not add public extension contracts.

## Recommended Architecture

Use a small adapter around the current `FullscreenTuiState` and `NativeOperatorApiClient`.

The adapter should:

1. Initialize the existing thread state through `initializeFullscreenTuiState`.
2. Render messages through restored OpenClaw `ChatLog` components.
3. Render slash-command panels as styled system messages.
4. Use the restored `CustomEditor` for input.
5. Use the restored theme for header, footer, user messages, assistant markdown, links, and status text.
6. Continue to call `submitFullscreenPrompt` and `runFullscreenCommand` for behavior.

This keeps the current state and command logic as the boundary. The UI kit becomes presentation-only.

## Component Boundaries

`src/tui/theme/theme.ts`

Terminal palette and formatting. Adapted from OpenClaw, with local helpers instead of old shared utilities.

`src/tui/osc8-hyperlinks.ts`

OSC 8 hyperlink restoration for markdown-rendered links and bare URLs.

`src/tui/components/*`

Presentation components restored from OpenClaw:

- assistant markdown messages
- user message blocks
- system messages
- chat log pruning
- custom editor key handling

Keep this subset independent of old gateway/event/tool types.

`src/tui/fullscreen/run.ts`

Replace the Ink renderer with a pi-tui runner:

- start terminal
- render header, chat log, status, footer, editor
- submit commands/prompts through current state functions
- stop terminal safely

`src/tui/fullscreen/view.ts`

Small pure helpers for formatting header/footer/status and syncing state into the chat log. Tests target this file rather than terminal rendering internals.

## Data Flow

Startup:

1. CLI creates or connects to local HTTP server.
2. CLI creates `NativeOperatorApiClient`.
3. TUI initializes `FullscreenTuiState`.
4. UI renders active thread messages.

Prompt:

1. Editor submits text.
2. UI calls `submitFullscreenPrompt`.
3. Optimistic user and assistant placeholder state renders immediately.
4. Final response replaces placeholder.
5. Right rail context values are folded into footer/status text.

Command:

1. Editor submits slash command.
2. UI calls `beginFullscreenCommand`.
3. UI calls `runFullscreenCommand`.
4. Resulting panel is rendered as a styled system message.
5. `/exit` stops the terminal.

## Error Handling

- Prompt errors render as assistant error text and a system error panel.
- Command errors render as system messages.
- Terminal shutdown must restore raw mode/cursor even when the client or server throws.
- Server close should tolerate already-closed local server handles.

## Tests

Keep behavior tests around `src/tui/fullscreen/state.ts`.

Add focused tests for:

- header/footer formatting
- message role rendering into chat-log view models
- command panel rendering
- terminal stop error classification if extracted

Run:

- `pnpm tsgo`
- `pnpm test`
- `pnpm check:changed`

## Migration

Remove the Ink/React TUI dependency path. The project should use `@mariozechner/pi-tui` and `chalk` for terminal UI.

The current `src/tui/fullscreen/state.ts` remains the command/state owner. The restored OpenClaw UI components are display infrastructure only.
