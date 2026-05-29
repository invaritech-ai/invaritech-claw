# AGENTS.MD

Telegraph style. Root rules only. Read scoped `AGENTS.md` before touching a subtree.

## Start

- Product: iclaw.
- Replies: repo-root file refs only.
- First pass: run docs list (`pnpm docs:list`; ignore if unavailable), then read only relevant docs.
- Missing deps: run `pnpm install`, rerun once, then report the first actionable error.
- New `AGENTS.md`: add sibling `CLAUDE.md` symlink to it.

## Repo Map

- Core TypeScript: `src/`
- Tests: `test/`
- Docs: `docs/`
- Scripts: `scripts/`
- CLI shim: `iclaw.mjs`

## Architecture

- One pnpm-managed package. No workspace packages in v1.
- Product surface is terminal and headless only: CLI, TUI/operator console, local HTTP server.
- SQLite is canonical state.
- Config is JSON5 at `~/.iclaw/iclaw.json` unless overridden.
- Providers are OpenRouter and Ollama only.
- Runs are the center of the runtime. API requests, webhooks, schedules, and TUI actions create or inspect runs.
- Tools are deny by default. Keep tool policy explicit.
- Approvals are run-blocking operator state, not a multi-tenant auth boundary.
- Keep extension seams small and internal until a later feature earns a public contract.
- No compatibility shims or migration helpers.

## Commands

- Install: `pnpm install`
- Dev CLI: `pnpm iclaw ...` or `pnpm dev`
- Build: `pnpm build`
- Full gate: `pnpm check`
- Changed gate: `pnpm check:changed`
- Tests: `pnpm test`
- Changed tests: `pnpm test:changed`
- Format check/fix: `pnpm format:check` / `pnpm format`
- Typecheck: `pnpm tsgo`, `pnpm tsgo:all`
- Lint: `pnpm lint`

## Code Style

- TypeScript ESM. Strict types.
- Avoid `any`; prefer real types, `unknown`, and narrow adapters.
- No `@ts-nocheck`.
- No lint suppressions unless intentional and explained.
- External boundaries should use structured validation.
- Runtime branching should use closed codes or discriminated unions.
- Comments only for non-obvious logic.
- Keep files split when size hurts clarity or testability.
- Product naming: `iclaw` everywhere.

## Tests

- Vitest.
- Tests live under `test/`.
- Use repo scripts, not raw `vitest`.
- Clean up timers, env, globals, mocks, sockets, temp dirs, and module state.
- Prefer seam-depth tests: pure helpers, repositories, service boundaries, provider transports, and HTTP routes.
- Keep fixtures small and local.

## Docs

- Update docs when behavior, config, API, provider, schedule, webhook, or security behavior changes.
- Small Markdown docs only for v1.
- Keep README and docs aligned with the current runnable surface.

## Git

- Use `scripts/committer "<msg>" <file...>` when practical.
- Stage only intended files.
- Commits should be concise and action-oriented.
- No branch or worktree changes unless requested.
- Do not revert user changes unless explicitly requested.

## Security

- Never commit credentials or live config.
- Bind local servers to loopback by default.
- Provider secrets belong in environment variables or a local secret store.
- Treat webhook bodies and API inputs as untrusted.
- Review custom APIs, tools, and webhooks as trusted code.
