# iclaw fork - implementation checklist

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to execute one phase at a time. Do not try to land the full fork in a single pass.

**Goal:** Execute the phased fork roadmap in separate, reviewable phases. Each phase should end with a green gate before the next phase starts.

**Architecture:** The roadmap is split into four phases: rename and migration cleanup, provider lockdown, product-surface trimming, and final packaging/docs cleanup. The public CLI/API/plugin extensibility seams stay generic throughout.

**Source of truth for scope:** [`2026-04-27-iclaw-deletion-bundles.md`](./2026-04-27-iclaw-deletion-bundles.md)
**Baseline inventory:** [`../iclaw-phase-0-inventory.md`](../iclaw-phase-0-inventory.md)

---

## Shared rules

- Use `scripts/committer "<msg>" <file...>` for commits.
- Keep each phase small enough that the diff is easy to review.
- Run `pnpm check:changed` before every phase commit.
- Run the broader gate that matches the touched surface before landing the phase.
- Preserve sub-agent paths and tests.

---

### Phase 1: Finish rename and migration cleanup

**Files:** rename and migration paths in `src/config/**`, `src/commands/**`, docs under `docs/superpowers/**`, and any remaining owned `openclaw` strings in banners/help/log text.

- [ ] Remove remaining owned `openclaw` strings from user-facing copy.
- [ ] Finalize state-dir and config migration behavior so `~/.iclaw` and `iclaw.json` are the canonical paths.
- [ ] Keep only explicit compatibility shims needed for migration.
- [ ] Run the rename-focused tests and `pnpm check:changed`.

### Phase 2: Lock providers to OpenRouter and Ollama

**Files:** provider discovery, model listing, onboarding, validation, docs, and provider tests.

- [ ] Make the final provider set explicit in validation and discovery.
- [ ] Reject or hide non-target providers in operator-facing flows.
- [ ] Keep the provider/plugin extensibility seam generic.
- [ ] Run provider/config/model tests and `pnpm check:changed`.

### Phase 3: Trim the product surface

**Files:** channel-only and extra UI surfaces in `src/channels/**`, gateway UI routes, pairing paths, and their docs/tests.

- [ ] Remove or hide the surfaces that are not part of the slim TUI product.
- [ ] Keep the gateway pieces the TUI still depends on: sessions, sub-agents, cron, and canvas/A2UI.
- [ ] Update the affected tests and docs together.
- [ ] Run gateway/TUI scoped validation and `pnpm check:changed`.

### Phase 4: Packaging and final cleanup

**Files:** workspace scopes, plugin manifests, bundle IDs, CI/workflows, labels, and the remaining docs sweep.

- [ ] Rename remaining owned packaging identifiers.
- [ ] Remove stale docs and workflow references.
- [ ] Run the final grep sweep for owned `openclaw` references.
- [ ] Finish with `pnpm build` and the broad test sweep.
