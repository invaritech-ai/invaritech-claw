---
summary: "Run OpenClaw as a minimal personal assistant: CLI, TUI, skills, HTTP API, and Ollama only"
read_when:
  - You want a small provider surface and local models only
title: "Minimal assistant (Ollama-focused)"
---

## What you get

With **`ICLAW_MINIMAL_ASSISTANT=1`** (recommended for this fork’s goals):

- **Bundled plugins**: only the **`ollama`** extension directory under the stock `extensions/` tree is **discovered** at runtime. Other provider/channel packages can stay on disk for upstream merges but are ignored unless you override the filter (see below).
- **Config defaults** (when you have not set them): `gateway.bind` defaults to **loopback**, and `plugins.allow` defaults to **`["ollama"]`**.
- **Gateway auth**: **`gateway.auth` mode `none` is rejected** at startup — use a token or password (or env `ICLAW_GATEWAY_TOKEN` / `ICLAW_GATEWAY_PASSWORD`).

CLI **skills** (`openclaw skills`), **TUI** (`openclaw tui` / `openclaw chat`), and **gateway HTTP APIs** (when enabled in config) continue to work; messaging connectors are simply not loaded unless you add their plugin ids to `plugins.allow` and widen the bundled directory list.

## Environment variables

| Variable                    | Effect                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ICLAW_MINIMAL_ASSISTANT=1` | Ollama-only bundled discovery + hardening defaults above.                                                                                                   |
| `ICLAW_LEAN_GATEWAY=1`      | Same hardening defaults; does **not** restrict bundled directories unless you also set `ICLAW_BUNDLED_PLUGIN_DIRS` or `ICLAW_MINIMAL_ASSISTANT`.            |
| `ICLAW_BUNDLED_PLUGIN_DIRS` | Comma-separated **top-level** folder names under the bundled extensions root (e.g. `ollama,memory-core`). Overrides the minimal-assistant default when set. |

## Optional: shrink the repo on disk

To remove unused extension packages from the workspace (advanced; rebases can be painful), keep **`extensions/ollama`** and delete other `extensions/*` folders, then run `pnpm install`. CI and extension-only tests in upstream are not expected to pass on such a tree; prefer **`ICLAW_MINIMAL_ASSISTANT=1`** if you only need a smaller **runtime** surface.

## See also

- [Security](/gateway/security)
- [HTTP ingress matrix](/gateway/security/http-ingress-matrix)
- [CLI skills](/cli/skills)
- [CLI TUI](/cli/tui)
