#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

log_step() {
  printf '\n==> %s\n' "$*"
}

run_step() {
  log_step "$*"
  "$@"
}

run_linux_ci_mirror() {
  run_step pnpm check
  run_step pnpm build:strict-smoke
  run_step pnpm lint:ui:no-raw-window-open
  run_step pnpm protocol:gen
  run_step node scripts/run-vitest.mjs run --config test/vitest/vitest.extensions.config.ts --maxWorkers=1
  run_step env CI=true node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1

  log_step "ICLAW_VITEST_MAX_WORKERS=${ICLAW_VITEST_MAX_WORKERS:-1} NODE_OPTIONS=${NODE_OPTIONS:---max-old-space-size=6144} pnpm test"
  ICLAW_VITEST_MAX_WORKERS="${ICLAW_VITEST_MAX_WORKERS:-1}" \
  NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144}" \
    pnpm test
}

main() {
  run_linux_ci_mirror
}

main "$@"
