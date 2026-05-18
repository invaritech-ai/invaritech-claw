# iclaw fork - phased execution roadmap

> **See also:** [`2026-04-26-iclaw-hard-fork-design.md`](./2026-04-26-iclaw-hard-fork-design.md) for the product contract, [`iclaw-rebrand-checklist.md`](./iclaw-rebrand-checklist.md) for rename status, and [`../iclaw-phase-0-inventory.md`](../iclaw-phase-0-inventory.md) for the baseline inventory.

**Status:** Active roadmap. The earlier one-shot bundle idea is superseded; the fork should land in small phases with a green gate after each phase.

---

## Current State

- Channel extension deletion is already largely reflected in this checkout.
- The remaining provider surface is already narrowed to `ollama` and `openrouter` at the extension level, but the runtime, docs, and validation layers still accept broader model/provider concepts.
- `iclaw` naming is established in the core binary and CLI, but compatibility and packaging cleanup are still pending.

---

## Phased Plan

### Phase 1 - Finish rename and migration cleanup

Keep the work small: state dir, config filename, strict-home behavior, doctor migration, and remaining owned `openclaw` strings. Do not combine this with provider or surface removals.

Exit when legacy users can migrate cleanly and the owned rename surface is effectively done.

### Phase 2 - Lock providers to OpenRouter and Ollama

Make the final provider set explicit in config validation, discovery, onboarding, model listing, and docs. Preserve the public provider/plugin seams, but fail closed on other provider ids.

Exit when non-target providers are absent or rejected in every operator-facing path.

### Phase 3 - Trim the product surface

Remove or hide channel-only, pairing-only, and extra UI paths while preserving the gateway contract needed by the TUI: sessions, sub-agents, cron, and canvas/A2UI.

Exit when the remaining CLI/gateway surface matches the slim product contract.

### Phase 4 - Packaging and final cleanup

Rename workspace scopes, plugin manifests, bundle identifiers, CI labels, and remaining docs. Finish with a full grep sweep and remove the last compatibility shims that are no longer required.

Exit when only explicit upstream references and still-needed migration paths mention the old name.

---

## Guardrails

- Keep CLI/API/plugin extensibility generic while the final defaults narrow.
- Preserve sub-agent paths and tests.
- Land each phase with the smallest validation set that proves the changed surface.
