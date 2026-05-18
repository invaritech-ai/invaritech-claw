# iclaw hard fork - phased roadmap

> **See also:** [`2026-04-25-iclaw-rebrand.md`](./2026-04-25-iclaw-rebrand.md) for rename-specific status, [`iclaw-rebrand-checklist.md`](./iclaw-rebrand-checklist.md) for rename tracking, and [`../iclaw-phase-0-inventory.md`](../iclaw-phase-0-inventory.md) for the current ground-truth inventory.

**Status:** Approved direction. The fork is already partway through the cutover, so the rest of the work should land in small phases instead of one large deletion pass.

---

## Current State

- The repo already uses `iclaw` for the root package name, CLI name, binary entrypoint, and `ICLAW_*` env prefix.
- Phase 0 inventory is complete and remains the baseline snapshot for the fork.
- The runtime already has an opt-in hardening profile that seeds `plugins.allow` with `ollama` and `openrouter`, and bundled discovery can be filtered down to those two providers.
- The extension tree in this checkout is already narrowed to the `ollama` and `openrouter` provider packages plus non-provider support extensions.
- Legacy `openclaw` compatibility still exists in migration paths, docs, package scopes, plugin manifests, and some user-facing strings.
- Channel-related, packaging-related, and docs-related cleanup is still broader than the final product contract.

---

## Final Target

1. **iclaw naming everywhere** for owned surfaces: package metadata, CLI, docs, manifests, env names, and user-visible strings.
2. **Only OpenRouter and Ollama** as supported model providers.
3. **Extensible CLI/API/plugin seams** remain generic, so the product can still grow through public contracts instead of hardcoded special cases.
4. **Slim product surface**: TUI is the operator UI, the gateway keeps cron, sessions, sub-agents, and canvas/A2UI, and removed surfaces do not stay reachable by accident.

---

## What Stays Extensible

- Keep the public plugin SDK, plugin registry, and model/provider config schema generic.
- Keep CLI and API affordances for discovery, install, status, and diagnosis generic even as the default allowed set shrinks.
- Keep gateway internals focused on the shared runtime contract: sessions, cron, TUI transport, sub-agents, and canvas/A2UI.

The fork should narrow defaults and validation, not collapse the extension model into one-off product cases.

---

## Phases

| Phase | Focus                                                                                                                                                                                                                                                    | Exit bar                                                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Finish state, config, and runtime identity cleanup.** Make `~/.iclaw`, `iclaw.json`, `iclaw` package metadata, and `iclaw` CLI identity canonical. Keep legacy `openclaw` path handling only in explicit migration or doctor paths.                    | Default runtime paths and version identity no longer silently accept legacy `openclaw` surfaces, and the doctor migration path still works. |
| **2** | **Lock providers to OpenRouter and Ollama.** Make the final supported provider set explicit in config validation, onboarding, model listing, discovery, and docs. Reject or hide every other provider cleanly instead of silently carrying them through. | Non-target providers fail closed or are absent from operator-facing flows, while the provider SDK/discovery seam stays generic.             |
| **3** | **Trim product surfaces.** Remove or hide channel-only, pairing-only, and extra UI paths while preserving the gateway contract that the TUI still depends on: sessions, sub-agents, cron, and canvas/A2UI.                                               | The remaining CLI/gateway surface matches the slim product contract and the removed surfaces no longer have a supported path.               |
| **4** | **Packaging and final cleanup.** Rename workspace scopes, plugin manifests, app bundle IDs, CI/workflow labels, and the remaining docs. Then run the final grep sweep and remove the last compatibility shims that are no longer needed.                 | No owned `openclaw` references remain except explicit upstream notes or migration shims that are still required.                            |

---

## Validation

- Each phase ends with the narrow gates that match the touched surfaces.
- Use `pnpm check:changed` as the default per-phase gate.
- Run `pnpm build` before landing changes that can affect packaging, lazy loading, or public contracts.
- Run the broader test sweep before the final packaging and docs cleanup lands.

---

## Notes

- The phase order matters. Do not combine rename cleanup, provider lockdown, and surface pruning into one large patch unless the diff is genuinely trivial.
- The inventory document remains the detailed baseline snapshot; the phased roadmap is the source for current sequencing.
