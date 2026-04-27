# iclaw deletion bundles — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the three-bundle aggressive deletion of channels, non-target providers, apps, control UI, canvas/A2UI, and dead docs from the iclaw fork — landing in three reviewable commits, each ending with green tests.

**Architecture:** Per [`2026-04-27-iclaw-deletion-bundles.md`](./2026-04-27-iclaw-deletion-bundles.md). Bundle 1 = extension purge (manifest-discovered, low risk). Bundle 2 = apps + Control UI/canvas + `src/channels` trim (touches core HTTP and CLI). Bundle 3 = gateway internals + repo-root junk + docs.

**Tech Stack:** TypeScript ESM, pnpm workspaces, Vitest, tsgo, ESLint, Mintlify docs.

**Source of truth for scope:** [`2026-04-27-iclaw-deletion-bundles.md`](./2026-04-27-iclaw-deletion-bundles.md).
**Sub-agent preservation list:** [`../iclaw-phase-0-inventory.md`](../iclaw-phase-0-inventory.md) § "Sub-agents — do not delete without review".

---

## Conventions used in every task

- **Commits:** use `scripts/committer "<msg>" <file...>` (formats staged files, then commits). Never raw `git commit`. Stage only the intended files.
- **CLI name:** `pnpm iclaw …` (never `pnpm openclaw`).
- **Per-task verification gate:** `pnpm check:changed` before any commit inside a bundle (cheap).
- **Per-bundle final gate:** full block (tsgo:prod / lint / cycles / test) **before** the bundle commit.
- **Sub-agent invariant:** `rg -l 'subagent' src/ | wc -l` must equal the baseline captured at Bundle 1 start. Re-check before each bundle commit.
- **Rollback any bundle:** `git revert <bundle-commit-sha>` reverses cleanly because each bundle is one commit.

---

## Pre-flight (run once, before Bundle 1)

### Task 0: Capture baselines

**Files:** none (writes to `/tmp` only).

- [ ] **Step 1: Confirm clean working tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean` on `main`.

- [ ] **Step 2: Capture sub-agent file count**

```bash
rg -l 'subagent' src/ | wc -l > /tmp/iclaw-subagent-baseline
cat /tmp/iclaw-subagent-baseline
```

Expected: a number (record it; this is the invariant).

- [ ] **Step 3: Capture extension count**

```bash
ls extensions/ | grep -v '\.' | wc -l > /tmp/iclaw-ext-baseline
cat /tmp/iclaw-ext-baseline
```

Expected: ~99 directories.

- [ ] **Step 4: Confirm green starting state**

```bash
pnpm install
pnpm tsgo:core
pnpm lint:core
pnpm check:import-cycles
```

Expected: all green. If anything fails, **stop** — fix or rebase before starting bundles.

---

## Bundle 1 — Extension purge

**Result:** ~83 extension directories removed; loose test files cleaned; lockfile regenerated.

### Task 1.1: Delete messaging channels (26 dirs)

**Files:** delete entire dirs under `extensions/`.

- [ ] **Step 1: Remove channel extensions**

```bash
cd /Users/avi/Documents/Projects/AI/invaritech-claw
rm -rf extensions/bluebubbles \
       extensions/discord \
       extensions/feishu \
       extensions/google-meet \
       extensions/googlechat \
       extensions/imessage \
       extensions/irc \
       extensions/line \
       extensions/matrix \
       extensions/mattermost \
       extensions/microsoft \
       extensions/msteams \
       extensions/nextcloud-talk \
       extensions/nostr \
       extensions/qa-channel \
       extensions/qqbot \
       extensions/signal \
       extensions/slack \
       extensions/synology-chat \
       extensions/telegram \
       extensions/tlon \
       extensions/twitch \
       extensions/voice-call \
       extensions/whatsapp \
       extensions/zalo \
       extensions/zalouser
```

- [ ] **Step 2: Verify**

```bash
ls extensions/ | grep -E '^(bluebubbles|discord|feishu|google-meet|googlechat|imessage|irc|line|matrix|mattermost|microsoft|msteams|nextcloud-talk|nostr|qa-channel|qqbot|signal|slack|synology-chat|telegram|tlon|twitch|voice-call|whatsapp|zalo|zalouser)$'
```

Expected: no output (all gone).

### Task 1.2: Delete non-target providers (49 dirs)

- [ ] **Step 1: Remove provider extensions**

```bash
rm -rf extensions/alibaba \
       extensions/amazon-bedrock \
       extensions/amazon-bedrock-mantle \
       extensions/anthropic \
       extensions/anthropic-vertex \
       extensions/arcee \
       extensions/byteplus \
       extensions/chutes \
       extensions/cloudflare-ai-gateway \
       extensions/codex \
       extensions/comfy \
       extensions/copilot-proxy \
       extensions/deepgram \
       extensions/deepseek \
       extensions/elevenlabs \
       extensions/fal \
       extensions/fireworks \
       extensions/github-copilot \
       extensions/google \
       extensions/groq \
       extensions/huggingface \
       extensions/kilocode \
       extensions/kimi-coding \
       extensions/litellm \
       extensions/lmstudio \
       extensions/microsoft-foundry \
       extensions/minimax \
       extensions/mistral \
       extensions/moonshot \
       extensions/nvidia \
       extensions/openai \
       extensions/opencode \
       extensions/opencode-go \
       extensions/qianfan \
       extensions/qwen \
       extensions/runway \
       extensions/sglang \
       extensions/stepfun \
       extensions/synthetic \
       extensions/tencent \
       extensions/together \
       extensions/venice \
       extensions/vercel-ai-gateway \
       extensions/vllm \
       extensions/volcengine \
       extensions/voyage \
       extensions/vydra \
       extensions/xai \
       extensions/xiaomi \
       extensions/zai
```

- [ ] **Step 2: Verify only ollama and openrouter remain among providers**

```bash
find extensions -maxdepth 2 -name 'openclaw.plugin.json' -exec grep -l '"kind"\s*:\s*"provider"' {} \; 2>/dev/null
```

Expected: only `extensions/ollama/openclaw.plugin.json` and `extensions/openrouter/openclaw.plugin.json` (kind may not be in manifest — alternative check below).

```bash
ls extensions/ | grep -iE '(provider|llm)' || true
```

Expected: empty or only ollama/openrouter related.

### Task 1.3: Delete tool-only search/web plugins (7 dirs)

- [ ] **Step 1: Remove search/web tool extensions**

```bash
rm -rf extensions/brave \
       extensions/duckduckgo \
       extensions/exa \
       extensions/firecrawl \
       extensions/perplexity \
       extensions/searxng \
       extensions/tavily
```

### Task 1.4: Delete media-gen, voice, phone (5 dirs + 2 stray test files)

- [ ] **Step 1: Remove media-gen, voice, phone extensions**

```bash
rm -rf extensions/image-generation-core \
       extensions/video-generation-core \
       extensions/speech-core \
       extensions/talk-voice \
       extensions/phone-control
```

- [ ] **Step 2: Remove stray live-test files in extensions/ root**

```bash
rm -f extensions/music-generation-providers.live.test.ts \
      extensions/video-generation-providers.live.test.ts
```

### Task 1.5: Delete pairing/discovery (2 dirs)

- [ ] **Step 1: Remove pairing extensions**

```bash
rm -rf extensions/device-pair extensions/bonjour
```

### Task 1.6: Delete niche / dev / heavy-dep extensions (7 dirs)

- [ ] **Step 1: Remove niche extensions**

```bash
rm -rf extensions/lobster \
       extensions/acpx \
       extensions/open-prose \
       extensions/qa-lab \
       extensions/qa-matrix \
       extensions/skill-workshop \
       extensions/diagnostics-otel
```

### Task 1.7: Verify kept extensions are intact

- [ ] **Step 1: Confirm all 16 kept extensions still present**

```bash
for d in ollama openrouter browser media-understanding-core memory-core memory-lancedb memory-wiki active-memory thread-ownership diffs llm-task openshell tokenjuice webhooks shared test-support; do
  test -d "extensions/$d" || echo "MISSING: $d"
done
```

Expected: no output (all 16 directories present).

- [ ] **Step 2: Snapshot remaining extension count**

```bash
ls extensions/ | wc -l
```

Expected: significantly fewer entries (~16 dirs + a few config/doc files).

### Task 1.8: Regenerate lockfile

**Files:** `pnpm-lock.yaml` (auto-updated).

- [ ] **Step 1: Reinstall to drop stale workspace links and external deps**

```bash
pnpm install
```

Expected: removes packages from removed extensions; lockfile updated; no errors. Warnings about unused deps in remaining packages are fine.

### Task 1.9: Update `.github/labeler.yml`

**Files:** Modify `.github/labeler.yml`.

- [ ] **Step 1: Open the file and remove rules referencing deleted extensions**

```bash
$EDITOR .github/labeler.yml
```

Action: delete any rule blocks whose globs target `extensions/<deleted-dir>/**`. Keep rules for kept extensions (ollama, openrouter, browser, memory-\*, etc.).

- [ ] **Step 2: Verify YAML still parses**

```bash
node -e "console.log(require('js-yaml').load(require('fs').readFileSync('.github/labeler.yml','utf8')))" 2>&1 | head -5
```

Expected: prints a parsed object, no SyntaxError. (If `js-yaml` not installed at root, use `python3 -c "import yaml,sys; yaml.safe_load(open('.github/labeler.yml'))"`.)

### Task 1.10: Update Vitest shard configs

**Files:** likely `vitest.config.ts`, `vitest.workspace.ts`, or sharded configs under `test/` or `vitest/`.

- [ ] **Step 1: Find shard configs naming deleted extensions**

```bash
rg -l 'extensions/(openai|anthropic|telegram|whatsapp|discord|slack|signal|matrix|imessage)' vitest* test/ 2>/dev/null || true
```

- [ ] **Step 2: Edit each match to remove deleted-extension entries**

For each file, delete shard-include patterns referencing removed dirs. Example: an `OpenAI` heavy shard or `channel-*` shard becomes empty → delete the whole shard entry.

- [ ] **Step 3: Verify no stale references**

```bash
rg 'extensions/(telegram|whatsapp|discord|slack|signal|openai|anthropic)' . --glob '!docs/**' --glob '!CHANGELOG.md' --glob '!**/*.md'
```

Expected: no matches outside docs/changelog (those are handled in Bundle 3).

### Task 1.11: Drop plugin-catalog test assertions for deleted ids

**Files:** likely `src/plugins/**/*.test.ts` or `extensions/test-support/**/*.test.ts` asserting catalog membership.

- [ ] **Step 1: Find catalog/registry assertions**

```bash
rg -l '"telegram"|"whatsapp"|"openai"|"anthropic"' src/plugins/ src/plugin-sdk/ test/ 2>/dev/null
```

- [ ] **Step 2: For each match, remove the deleted-id entries from expected lists**

Open each file. Tests asserting "catalog contains telegram/whatsapp/openai/etc" — drop those entries. Tests asserting "catalog excludes X" — leave alone.

- [ ] **Step 3: Run those tests**

```bash
pnpm test:changed
```

Expected: catalog tests pass with new shorter lists.

### Task 1.12: Sub-agent invariant check

- [ ] **Step 1: Compare current sub-agent file count to baseline**

```bash
test "$(rg -l 'subagent' src/ | wc -l)" = "$(cat /tmp/iclaw-subagent-baseline)" && echo OK || echo CHANGED
```

Expected: `OK`. If `CHANGED`, **stop** — investigate which sub-agent files moved/disappeared (none should change in Bundle 1).

### Task 1.13: Bundle 1 verification gate

- [ ] **Step 1: Type check (core + extensions prod)**

```bash
pnpm tsgo:prod
```

Expected: green.

- [ ] **Step 2: Lint**

```bash
pnpm lint:core && pnpm lint:extensions
```

Expected: green.

- [ ] **Step 3: Import cycles**

```bash
pnpm check:import-cycles
```

Expected: green.

- [ ] **Step 4: Full test sweep**

```bash
pnpm test
```

Expected: green. If failures relate to deleted extensions (e.g., catalog tests still asserting telegram), return to Task 1.11. If failures are unrelated, fix or note (per CLAUDE.md "do not land related failing tests").

### Task 1.14: Bundle 1 commit

- [ ] **Step 1: Stage only intended changes**

```bash
git status
```

Expected list: many `D` entries under `extensions/`, plus `M` on `pnpm-lock.yaml`, `.github/labeler.yml`, vitest configs, and any catalog test files.

- [ ] **Step 2: Commit via committer**

```bash
scripts/committer "feat(iclaw): bundle 1 — purge channels, non-target providers, tool-only plugins, media-gen, voice, pairing, niche extensions

Removes 83 extension directories per docs/superpowers/plans/2026-04-27-iclaw-deletion-bundles.md (Bundle 1).

Kept extensions: ollama, openrouter, browser, media-understanding-core, memory-core, memory-lancedb, memory-wiki, active-memory, thread-ownership, diffs, llm-task, openshell, tokenjuice, webhooks, shared, test-support.

Sub-agent invariant: rg -l 'subagent' src/ unchanged from baseline." \
  $(git diff --name-only HEAD) \
  $(git ls-files --deleted) \
  $(git ls-files --others --exclude-standard)
```

If committer balks at the deleted-files list, fall back:

```bash
git add -A extensions/ .github/labeler.yml pnpm-lock.yaml vitest*.ts test/ src/plugins/ src/plugin-sdk/
scripts/committer "feat(iclaw): bundle 1 — purge channels, non-target providers, tool-only plugins, media-gen, voice, pairing, niche extensions" .
```

- [ ] **Step 3: Capture bundle 1 SHA**

```bash
git rev-parse HEAD > /tmp/iclaw-bundle-1-sha
cat /tmp/iclaw-bundle-1-sha
```

**Rollback:** `git revert $(cat /tmp/iclaw-bundle-1-sha)`.

---

## Bundle 2 — Apps, Control UI/canvas, src/channels trim

**Result:** companion apps gone; canvas/A2UI HTTP surface gone; `src/channels/` trimmed to operator-session minimum; channel CLI/doctor/onboard cleaned.

### Task 2.1: Delete companion app trees

**Files:** delete `apps/android/`, `apps/ios/`, `apps/macos/`, `Swabble/`.

- [ ] **Step 1: Remove dirs**

```bash
rm -rf apps/android apps/ios apps/macos Swabble
```

- [ ] **Step 2: Verify**

```bash
ls apps/
```

Expected: no android/ios/macos. Anything else (e.g., a CLI app) stays.

### Task 2.2: Drop apps lint/CI plumbing

**Files:** Modify `package.json`; modify or delete `.github/workflows/*macos*`, `*ios*`, `*android*`, `appcast.xml` workflow; modify release scripts.

- [ ] **Step 1: Remove `lint:apps` script from `package.json`**

Open `package.json`, locate `"scripts"`, delete the `"lint:apps"` entry. Also remove any `ios:version:sync` script.

- [ ] **Step 2: Delete app-specific GitHub workflows**

```bash
rm -f .github/workflows/macos-release.yml \
      .github/workflows/control-ui-locale-refresh.yml
```

(Audit `.github/workflows/` for any file named `*ios*`, `*android*`, `*mobile*` and delete those too. Use `ls .github/workflows/ | grep -iE 'ios|android|mobile|apps'` to find them.)

- [ ] **Step 3: Remove app version-bump references**

```bash
rg -l 'apps/(android|ios|macos)' scripts/ .github/ 2>/dev/null
```

For each match, remove the apps-specific block.

- [ ] **Step 4: Type/lint check**

```bash
pnpm tsgo:core && pnpm lint:core
```

Expected: green.

### Task 2.3: Delete canvas-host

**Files:** delete `src/canvas-host/` entirely.

- [ ] **Step 1: Find consumers first**

```bash
rg -l 'canvas-host|@iclaw/canvas|canvas-bundle' src/ extensions/ 2>/dev/null
```

Note every file that imports canvas-host — those need surgery in Task 2.4 / 2.5.

- [ ] **Step 2: Delete the dir**

```bash
rm -rf src/canvas-host
```

### Task 2.4: Surgically remove canvas/Control-UI from gateway server-http

**Files to edit:** `src/gateway/server-http.ts`, `src/gateway/server/http-auth.ts`.

**Files to delete:** `src/gateway/control-ui.ts`, `src/gateway/control-ui-routing.ts`, `src/gateway/canvas-capability.ts`.

- [ ] **Step 1: Delete control-ui and canvas-capability source files**

```bash
rm -f src/gateway/control-ui.ts \
      src/gateway/control-ui-routing.ts \
      src/gateway/canvas-capability.ts
```

- [ ] **Step 2: Edit `src/gateway/server-http.ts`**

Remove imports of the deleted modules. Remove pipeline stages named `canvas-auth`, `a2ui`, `canvas-http`, and any Control UI routing branch. Keep operator auth, RPC dispatch, and the webhook ingress entry point.

- [ ] **Step 3: Edit `src/gateway/server/http-auth.ts`**

Delete `isCanvasPath`, `authorizeCanvasRequest`, and any export of those. Remove path constants `A2UI_PATH`, `CANVAS_HOST_PATH`, `CANVAS_WS_PATH`.

- [ ] **Step 4: Delete canvas tests**

```bash
rm -f src/gateway/server.canvas-auth.test.ts
find src/gateway -name 'canvas-*.test.ts' -delete
find src/canvas-host -name '*.test.ts' -delete 2>/dev/null || true
```

- [ ] **Step 5: Verify no stale imports**

```bash
rg 'canvas-host|A2UI_PATH|CANVAS_HOST_PATH|CANVAS_WS_PATH|isCanvasPath|authorizeCanvasRequest|control-ui-routing|canvas-capability' src/
```

Expected: no matches.

- [ ] **Step 6: Type check**

```bash
pnpm tsgo:core
```

Expected: green. If errors, they point at remaining importers — edit those files to drop the imports/calls.

### Task 2.5: Trim `src/channels/` to operator-session minimum

**Files to edit:** files under `src/channels/`.

- [ ] **Step 1: Inventory current shape**

```bash
ls src/channels/
rg -l 'src/channels' src/ extensions/ | head -40
```

- [ ] **Step 2: Identify must-keep core**

Sub-agents and cron use channel session-key shaping. Keep types, session-key helpers, and operator-session glue. Delete: channel registries listing deleted ids, multi-channel routing, broadcast managers, channel-id enum members for deleted channels.

- [ ] **Step 3: Delete obvious channel-specific files**

```bash
rg -l 'telegramChannelId|whatsappChannelId|discordChannelId|slackChannelId|signalChannelId' src/channels/
```

Delete or trim each file: drop deleted-channel branches; if a file becomes empty/no-op, `rm` it.

- [ ] **Step 4: Run channel-related tests**

```bash
pnpm test src/channels/
```

Expected: green. Iterate on Step 3 edits until tests pass.

### Task 2.6: Remove `iclaw channels` CLI subcommand

**Files to edit / delete:** under `src/cli/`. Likely `src/cli/channels-cli.ts` or similar.

- [ ] **Step 1: Find the subcommand**

```bash
rg -l "'channels'|\"channels\"" src/cli/
```

- [ ] **Step 2: Delete the subcommand file and unregister**

Delete the channels CLI file. In the CLI registry (`src/cli/register.subclis.ts` or similar), remove the `channels` registration.

- [ ] **Step 3: Update CLI tests**

```bash
pnpm test src/cli/
```

Expected: green. Drop assertions naming `channels` subcommand.

### Task 2.7: Doctor + config schema fail-closed for deleted ids

**Files to edit:** `src/config/**/*.ts` (schema, validators), `src/cli/doctor*` or `src/doctor/**`.

- [ ] **Step 1: Find channel/provider validators**

```bash
rg -l 'validateChannel|knownChannels|channelKinds|providerKinds|knownProviders' src/
```

- [ ] **Step 2: Narrow allow-list**

In each schema file, narrow the allow-list to only kept ids: `ollama`, `openrouter` for providers; the remaining channel concept for channels (likely just `operator` / `tui`).

- [ ] **Step 3: Add fail-closed branch in doctor**

In the doctor module, if config references an unknown channel/provider id, surface an iclaw-branded error: `Unknown <kind> id "<id>"; this fork only supports: <list>`.

- [ ] **Step 4: Test**

```bash
pnpm test src/config/ src/doctor/ 2>/dev/null || pnpm test src/cli/
```

Expected: green; existing config-rejection tests still pass.

### Task 2.8: Trim onboard wizard

**Files to edit:** `extensions/onboard*`, or `src/cli/onboard*`, or wherever the wizard lives.

- [ ] **Step 1: Find onboard**

```bash
rg -l 'onboardWizard|onboardStep|class Onboard' src/ extensions/
```

- [ ] **Step 2: Remove channel and non-target-provider picker steps**

Edit the wizard to skip channel setup entirely. Provider picker becomes "ollama or openrouter" — or auto-pick ollama if running locally.

- [ ] **Step 3: Test**

```bash
pnpm test --testNamePattern onboard 2>/dev/null || pnpm test src/cli/
```

### Task 2.9: Sub-agent invariant check

- [ ] **Step 1: Re-check baseline**

```bash
test "$(rg -l 'subagent' src/ | wc -l)" = "$(cat /tmp/iclaw-subagent-baseline)" && echo OK || echo CHANGED
```

Expected: `OK`. If `CHANGED`, identify which sub-agent file was touched. (Sub-agent core under `src/agents/subagent-*.ts` and `src/cron/isolated-agent/subagent-followup*.ts` must not change in Bundle 2.)

### Task 2.10: Bundle 2 verification gate

- [ ] **Step 1: Type check (full prod graph)**

```bash
pnpm tsgo:prod
```

Expected: green.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: green.

- [ ] **Step 3: Import cycles + architecture**

```bash
pnpm check:import-cycles && pnpm check:architecture
```

Expected: green.

- [ ] **Step 4: Full test sweep**

```bash
pnpm test
```

Expected: green.

- [ ] **Step 5: Build**

```bash
pnpm build
```

Expected: green. Watch for `[INEFFECTIVE_DYNAMIC_IMPORT]` — fix any that surface.

### Task 2.11: Bundle 2 commit

- [ ] **Step 1: Commit via committer**

```bash
git add -A
scripts/committer "feat(iclaw): bundle 2 — drop companion apps, canvas/Control-UI HTTP, src/channels trim

Per docs/superpowers/plans/2026-04-27-iclaw-deletion-bundles.md (Bundle 2).

- Removes apps/{android,ios,macos} and Swabble companion app trees.
- Removes src/canvas-host, src/gateway/{control-ui,control-ui-routing,canvas-capability}.
- Trims src/gateway/server-http and src/gateway/server/http-auth canvas/control-ui surface.
- Trims src/channels to operator-session minimum.
- Removes 'iclaw channels' subcommand; doctor and config schema fail-closed on unknown ids.
- Onboard wizard narrowed to ollama/openrouter providers, no channel step.

Sub-agent invariant: rg -l 'subagent' src/ unchanged from baseline." \
  .
```

- [ ] **Step 2: Capture bundle 2 SHA**

```bash
git rev-parse HEAD > /tmp/iclaw-bundle-2-sha
```

**Rollback:** `git revert $(cat /tmp/iclaw-bundle-2-sha)`.

---

## Bundle 3 — Slim gateway internals + repo-root junk + docs

**Result:** gateway server-methods/protocol slimmed; repo-root debris cleaned; docs collapsed to TUI-only narrative.

### Task 3.1: Trim `src/gateway/server-methods/` to surviving handlers

**Files to edit:** `src/gateway/server-methods/*.ts`, `src/gateway/server-methods.ts`, `src/gateway/method-scopes.ts`.

- [ ] **Step 1: List handlers**

```bash
ls src/gateway/server-methods/
```

- [ ] **Step 2: For each handler file, decide keep or drop**

Keep: `chat.ts`, `sessions.ts`, `agents.ts`, `models.ts`, `health.ts`, `cron.ts`, `subagent-followup.ts` (and its test helpers), and any handler used by the kept extensions (webhooks, browser, openshell). Drop: pairing/node-device handlers, control-ui-config handler, model-catalog entries for removed providers (these are typically inside `models.ts` data — narrow the list rather than deleting the file).

- [ ] **Step 3: Update `server-methods.ts` aggregation**

Open `src/gateway/server-methods.ts`. Remove imports/spreads for any handler files you deleted.

- [ ] **Step 4: Update `method-scopes.ts`**

Drop scope entries for deleted RPC methods.

- [ ] **Step 5: Run gateway tests**

```bash
pnpm test src/gateway/
```

Expected: green. Iterate.

### Task 3.2: Trim protocol schemas

**Files to edit:** `src/gateway/protocol/schema/*.ts`, `src/gateway/protocol/schema.ts`, `src/gateway/protocol/index.ts`.

- [ ] **Step 1: Identify schemas only used by deleted methods**

```bash
ls src/gateway/protocol/schema/
```

For each file, `rg -l 'fromXyzSchema'` to see if any kept handler imports it. Drop unreferenced schema files.

- [ ] **Step 2: Update aggregation files**

Edit `src/gateway/protocol/schema.ts` and `src/gateway/protocol/index.ts` to remove re-exports for deleted schemas.

- [ ] **Step 3: PROTOCOL_VERSION decision — freeze for now**

Leave `PROTOCOL_VERSION` constant unchanged; bumping is a separate decision tied to a real client break. Add a comment if any changes are wire-incompatible (we don't expect any since we only removed methods, didn't change signatures).

- [ ] **Step 4: Type check**

```bash
pnpm tsgo:core
```

Expected: green.

### Task 3.3: Trim broadcast events

**File to edit:** `src/gateway/server-broadcast.ts`.

- [ ] **Step 1: Drop broadcast channels for deleted events**

Open the file, remove entries for events that no longer fire (e.g., channel-related events). Keep: `cron`, `subagent`, `agent`, `chat`.

- [ ] **Step 2: Test**

```bash
pnpm test src/gateway/server-broadcast.test.ts 2>/dev/null || pnpm test src/gateway/
```

Expected: green.

### Task 3.4: Delete repo-root junk files

- [ ] **Step 1: Remove obvious junk**

```bash
rm -f fix2.py \
      dream-diary-preview-v2.html \
      dream-diary-preview-v3.html \
      'C:\openclaw' \
      appcast.xml
rm -rf openclaw-path-alias-GIQGIl openclaw-path-alias-j92KtC
```

- [ ] **Step 2: Untrack build output and gitignore**

```bash
git rm -r --cached dist dist-runtime 2>/dev/null || true
```

Edit `.gitignore` to ensure these lines exist:

```
dist/
dist-runtime/
```

- [ ] **Step 3: Audit other root files**

```bash
ls /Users/avi/Documents/Projects/AI/invaritech-claw/ | grep -vE '^(node_modules|extensions|src|docs|apps|scripts|test|packages|ui|pnpm-lock.yaml|pnpm-workspace.yaml|package.json|tsconfig|README|CHANGELOG|LICENSE|VISION|SECURITY|CLAUDE|AGENTS|CONTRIBUTING|INCIDENT_RESPONSE|Makefile|Dockerfile|docker-|knip|iclaw|fly|git-hooks|\.|assets|dist)' || true
```

Anything still listed is suspicious — review and `rm` if it's stale.

- [ ] **Step 4: Decide on Fly configs**

Keep `fly.toml` and `fly.private.toml` only if you intend Fly deploys. Otherwise:

```bash
rm -f fly.toml fly.private.toml
```

- [ ] **Step 5: Audit Dockerfiles**

```bash
ls Dockerfile*
```

If `Dockerfile.sandbox-browser` references deleted browser-channel surfaces, audit and trim. If purely build-stage, leave alone.

### Task 3.5: Docs sweep

- [ ] **Step 1: Delete dead doc directories**

```bash
rm -rf docs/channels \
       docs/web \
       docs/platforms \
       docs/nodes
rm -f docs/whatsapp-openclaw.jpg docs/whatsapp-openclaw-ai-zh.jpg
```

- [ ] **Step 2: Audit `docs/automation/`**

```bash
ls docs/automation/
```

If contents only describe deleted automations (channel webhooks, mobile-pair), `rm -rf docs/automation`. Otherwise trim per-file.

- [ ] **Step 3: Trim `docs/providers/`**

```bash
ls docs/providers/
```

Delete every provider doc except ollama and openrouter:

```bash
find docs/providers -mindepth 1 -maxdepth 1 ! -name 'ollama*' ! -name 'openrouter*' ! -name 'index.md' ! -name '_*' -exec rm -rf {} +
```

Edit `docs/providers/index.md` (if present) to list only ollama + openrouter.

- [ ] **Step 4: Collapse `docs/start/` and `docs/install/`**

Edit each surviving file under these dirs:

- Delete files describing macOS/iOS/Android install (`updating.md` may stay — single-source it).
- Rewrite `docs/start/getting-started.md` (if exists) to a single TUI quickstart: install → `pnpm iclaw doctor` → `pnpm iclaw tui --local`.

- [ ] **Step 5: Rewrite top-level narrative docs**

Edit `README.md`, `docs/index.md`, `VISION.md` to describe iclaw as a TUI fork: Ollama+OpenRouter, browser tool, screenshot/image-understanding, memory plugins, no channels/apps/canvas. Keep tone consistent with existing prose.

- [ ] **Step 6: Regenerate Mintlify nav**

```bash
$EDITOR docs.json
```

Manually trim nav groups for deleted dirs/pages. (If a generator exists — `pnpm docs:nav:gen` or similar — run it; otherwise hand-edit.)

- [ ] **Step 7: Append changelog entry**

Edit `CHANGELOG.md`. Under the active version's `### Changes`, add one line:

```
- Hard fork: removed messaging channels, non-Ollama/OpenRouter providers, companion apps, Control UI, and canvas/A2UI. iclaw is now TUI-only with browser, memory, and webhooks plugins. See docs/superpowers/plans/2026-04-27-iclaw-deletion-bundles.md.
```

Do not retroactively rewrite older entries.

- [ ] **Step 8: i18n glossary**

Per `docs/CLAUDE.md`, run:

```bash
pnpm docs:check-i18n-glossary 2>&1 | tail -20
```

If it complains about removed titles, accept the diff (those titles no longer need translations). If it requires a glossary edit, do it now.

### Task 3.6: Config / build cleanup

- [ ] **Step 1: Trim `knip.config.ts`**

```bash
$EDITOR knip.config.ts
```

Remove entries naming deleted packages/dirs.

- [ ] **Step 2: Trim CI workflows**

```bash
ls .github/workflows/
```

Delete:

```bash
rm -f .github/workflows/macos-release.yml \
      .github/workflows/control-ui-locale-refresh.yml \
      .github/workflows/qa-live-transports-convex.yml \
      .github/workflows/npm-telegram-beta-e2e.yml \
      .github/workflows/install-smoke.yml \
      .github/workflows/sandbox-common-smoke.yml \
      .github/workflows/parity-gate.yml \
      .github/workflows/openclaw-cross-os-release-checks-reusable.yml \
      .github/workflows/openclaw-live-and-e2e-checks-reusable.yml \
      .github/workflows/openclaw-npm-release.yml \
      .github/workflows/openclaw-release-checks.yml \
      .github/workflows/openclaw-scheduled-live-checks.yml \
      .github/workflows/plugin-clawhub-release.yml \
      .github/workflows/plugin-npm-release.yml \
      .github/workflows/docker-release.yml
```

(Audit each before deleting — keep any you actively use. Goal: collapse to ci.yml, codeql.yml, docs.yml, labeler.yml, stale.yml, workflow-sanity.yml.)

- [ ] **Step 3: Trim tsconfig package-boundary refs**

```bash
$EDITOR extensions/tsconfig.package-boundary.base.json
$EDITOR extensions/tsconfig.package-boundary.paths.json
```

Drop references to deleted packages. (These are referenced in the AGENTS.md package-boundary rules.)

- [ ] **Step 4: Drop channel-specific codemods**

```bash
ls scripts/codemods/
```

Keep `rename-openclaw-env-prefix*.mjs` (still useful for rebrand phases). Delete any codemod whose name references a deleted channel or provider.

### Task 3.7: Sub-agent invariant final check

- [ ] **Step 1: Re-check baseline**

```bash
test "$(rg -l 'subagent' src/ | wc -l)" = "$(cat /tmp/iclaw-subagent-baseline)" && echo OK || echo CHANGED
```

Expected: `OK`.

### Task 3.8: Bundle 3 verification gate (final acceptance)

- [ ] **Step 1: Clean install**

```bash
pnpm install
```

- [ ] **Step 2: Type check (full)**

```bash
pnpm tsgo:prod
```

Expected: green.

- [ ] **Step 3: Lint (full)**

```bash
pnpm lint
```

Expected: green.

- [ ] **Step 4: Cycles + architecture**

```bash
pnpm check:import-cycles && pnpm check:architecture
```

Expected: green.

- [ ] **Step 5: Full test sweep**

```bash
pnpm test
```

Expected: green.

- [ ] **Step 6: Build**

```bash
pnpm build
```

Expected: green; no `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings.

- [ ] **Step 7: Manual smoke**

```bash
pnpm iclaw doctor
```

Expected: passes; reports ollama/openrouter as the only known providers, no canvas, no channels.

```bash
pnpm iclaw tui --local
```

Expected: TUI boots; can send a message to ollama (if ollama is running locally); exits cleanly. (If ollama isn't running locally, just confirm it boots and reports the missing provider gracefully.)

### Task 3.9: Bundle 3 commit

- [ ] **Step 1: Commit via committer**

```bash
git add -A
scripts/committer "feat(iclaw): bundle 3 — slim gateway internals, drop repo-root junk, docs collapse to TUI-only

Per docs/superpowers/plans/2026-04-27-iclaw-deletion-bundles.md (Bundle 3).

- src/gateway/server-methods, method-scopes, protocol schemas, server-broadcast trimmed to surviving surface (chat, sessions, agents, models, cron, subagent-followup, health).
- Removed repo-root debris: fix2.py, dream-diary-preview-v{2,3}.html, openclaw-path-alias-*, C:\\openclaw, appcast.xml, dist/, dist-runtime/.
- Docs: deleted docs/channels, docs/web, docs/platforms, docs/nodes; trimmed docs/providers to ollama+openrouter; rewrote README/index/VISION as TUI-only narrative; regenerated docs.json nav.
- CI: dropped channel/macos/release/parity/sandbox/install-smoke workflows; collapsed to ci, codeql, docs, labeler, stale, workflow-sanity.
- knip.config.ts and tsconfig package-boundary refs trimmed.
- CHANGELOG entry added; PROTOCOL_VERSION frozen (no wire signature changes).

Sub-agent invariant: rg -l 'subagent' src/ unchanged from baseline." \
  .
```

- [ ] **Step 2: Capture bundle 3 SHA**

```bash
git rev-parse HEAD > /tmp/iclaw-bundle-3-sha
```

**Rollback:** `git revert $(cat /tmp/iclaw-bundle-3-sha)`.

---

## Post-bundle follow-ups (separate commits, not part of this plan)

- Rebrand checklist Phases 5–8 ([`iclaw-rebrand-checklist.md`](./iclaw-rebrand-checklist.md)): `@openclaw/*` → `@iclaw/*` package scopes (~16 packages), `openclaw.plugin.json` → `iclaw.plugin.json`, residual `[openclaw]` log prefixes, package.json `"openclaw"` metadata key.
- Memory plugin replacement decision (open question per [`../iclaw-phase-0-inventory.md`](../iclaw-phase-0-inventory.md) § Decisions).
- `PROTOCOL_VERSION` bump if/when a client break is intentional.

---

## Self-review notes

- All deletion tasks reference **explicit dir paths** matched to the design.
- Per-task verification commands listed.
- Sub-agent invariant re-checked at end of each bundle (Tasks 1.12, 2.9, 3.7).
- No placeholders. Every step has the actual command or edit target.
- Three commits, three SHAs captured, three rollback paths.
