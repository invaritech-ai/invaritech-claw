#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"

IMAGE_NAME="$(docker_e2e_resolve_image "openclaw-npm-telegram-live-e2e" ICLAW_NPM_TELEGRAM_LIVE_E2E_IMAGE)"
DOCKER_TARGET="${ICLAW_NPM_TELEGRAM_DOCKER_TARGET:-build}"
PACKAGE_SPEC="${ICLAW_NPM_TELEGRAM_PACKAGE_SPEC:-openclaw@beta}"
OUTPUT_DIR="${ICLAW_NPM_TELEGRAM_OUTPUT_DIR:-.artifacts/qa-e2e/npm-telegram-live}"

resolve_credential_source() {
  if [ -n "${ICLAW_NPM_TELEGRAM_CREDENTIAL_SOURCE:-}" ]; then
    printf "%s" "$ICLAW_NPM_TELEGRAM_CREDENTIAL_SOURCE"
    return 0
  fi
  if [ -n "${ICLAW_QA_CREDENTIAL_SOURCE:-}" ]; then
    printf "%s" "$ICLAW_QA_CREDENTIAL_SOURCE"
    return 0
  fi
  if [ -n "${CI:-}" ] && [ -n "${ICLAW_QA_CONVEX_SITE_URL:-}" ]; then
    if [ -n "${ICLAW_QA_CONVEX_SECRET_CI:-}" ] || [ -n "${ICLAW_QA_CONVEX_SECRET_MAINTAINER:-}" ]; then
      printf "convex"
    fi
  fi
}

resolve_credential_role() {
  if [ -n "${ICLAW_NPM_TELEGRAM_CREDENTIAL_ROLE:-}" ]; then
    printf "%s" "$ICLAW_NPM_TELEGRAM_CREDENTIAL_ROLE"
    return 0
  fi
  if [ -n "${ICLAW_QA_CREDENTIAL_ROLE:-}" ]; then
    printf "%s" "$ICLAW_QA_CREDENTIAL_ROLE"
  fi
}

validate_openclaw_package_spec() {
  local spec="$1"
  if [[ "$spec" =~ ^openclaw@(beta|latest|[0-9]{4}\.[1-9][0-9]*\.[1-9][0-9]*(-[1-9][0-9]*|-beta\.[1-9][0-9]*)?)$ ]]; then
    return 0
  fi
  echo "ICLAW_NPM_TELEGRAM_PACKAGE_SPEC must be openclaw@beta, openclaw@latest, or an exact OpenClaw release version; got: $spec" >&2
  exit 1
}

validate_openclaw_package_spec "$PACKAGE_SPEC"

docker_e2e_build_or_reuse "$IMAGE_NAME" npm-telegram-live "$ROOT_DIR/scripts/e2e/Dockerfile" "$ROOT_DIR" "$DOCKER_TARGET"

mkdir -p "$ROOT_DIR/.artifacts/qa-e2e"
run_log="$(mktemp "${TMPDIR:-/tmp}/openclaw-npm-telegram-live.XXXXXX")"
npm_prefix_host="$(mktemp -d "$ROOT_DIR/.artifacts/qa-e2e/npm-telegram-live-prefix.XXXXXX")"
trap 'rm -f "$run_log"; rm -rf "$npm_prefix_host"' EXIT
credential_source="$(resolve_credential_source)"
credential_role="$(resolve_credential_role)"
if [ -z "$credential_role" ] && [ -n "${CI:-}" ] && [ "$credential_source" = "convex" ]; then
  credential_role="ci"
fi

docker_env=(
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  -e ICLAW_NPM_TELEGRAM_PACKAGE_SPEC="$PACKAGE_SPEC"
  -e ICLAW_NPM_TELEGRAM_OUTPUT_DIR="$OUTPUT_DIR"
  -e ICLAW_NPM_TELEGRAM_FAST="${ICLAW_NPM_TELEGRAM_FAST:-1}"
)

forward_env_if_set() {
  local key="$1"
  if [ -n "${!key:-}" ]; then
    docker_env+=(-e "$key")
  fi
}

if [ -n "$credential_source" ]; then
  docker_env+=(-e ICLAW_QA_CREDENTIAL_SOURCE="$credential_source")
fi
if [ -n "$credential_role" ]; then
  docker_env+=(-e ICLAW_QA_CREDENTIAL_ROLE="$credential_role")
fi

for key in \
  OPENAI_API_KEY \
  ANTHROPIC_API_KEY \
  GEMINI_API_KEY \
  GOOGLE_API_KEY \
  ICLAW_LIVE_OPENAI_KEY \
  ICLAW_LIVE_ANTHROPIC_KEY \
  ICLAW_LIVE_GEMINI_KEY \
  ICLAW_QA_TELEGRAM_GROUP_ID \
  ICLAW_QA_TELEGRAM_DRIVER_BOT_TOKEN \
  ICLAW_QA_TELEGRAM_SUT_BOT_TOKEN \
  ICLAW_QA_CONVEX_SITE_URL \
  ICLAW_QA_CONVEX_SECRET_CI \
  ICLAW_QA_CONVEX_SECRET_MAINTAINER \
  ICLAW_QA_CREDENTIAL_LEASE_TTL_MS \
  ICLAW_QA_CREDENTIAL_HEARTBEAT_INTERVAL_MS \
  ICLAW_QA_CREDENTIAL_ACQUIRE_TIMEOUT_MS \
  ICLAW_QA_CREDENTIAL_HTTP_TIMEOUT_MS \
  ICLAW_QA_CONVEX_ENDPOINT_PREFIX \
  ICLAW_QA_CREDENTIAL_OWNER_ID \
  ICLAW_QA_ALLOW_INSECURE_HTTP \
  ICLAW_QA_REDACT_PUBLIC_METADATA \
  ICLAW_QA_TELEGRAM_CAPTURE_CONTENT \
  ICLAW_QA_SUITE_PROGRESS \
  ICLAW_NPM_TELEGRAM_PROVIDER_MODE \
  ICLAW_NPM_TELEGRAM_MODEL \
  ICLAW_NPM_TELEGRAM_ALT_MODEL \
  ICLAW_NPM_TELEGRAM_SCENARIOS \
  ICLAW_NPM_TELEGRAM_SUT_ACCOUNT \
  ICLAW_NPM_TELEGRAM_ALLOW_FAILURES; do
  forward_env_if_set "$key"
done

run_logged() {
  if ! "$@" >"$run_log" 2>&1; then
    cat "$run_log"
    exit 1
  fi
  cat "$run_log"
  >"$run_log"
}

echo "Running published npm Telegram live Docker E2E ($PACKAGE_SPEC)..."
run_logged docker run --rm \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e ICLAW_NPM_TELEGRAM_PACKAGE_SPEC="$PACKAGE_SPEC" \
  -v "$npm_prefix_host:/npm-global" \
  -i "$IMAGE_NAME" bash -s <<'EOF'
set -euo pipefail

export HOME="$(mktemp -d "/tmp/openclaw-npm-telegram-install.XXXXXX")"
export NPM_CONFIG_PREFIX="/npm-global"
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"

package_spec="${ICLAW_NPM_TELEGRAM_PACKAGE_SPEC:?missing ICLAW_NPM_TELEGRAM_PACKAGE_SPEC}"
echo "Installing ${package_spec}..."
npm install -g "$package_spec" --no-fund --no-audit

command -v openclaw
openclaw --version
EOF

run_logged docker run --rm \
  "${docker_env[@]}" \
  -v "$ROOT_DIR/.artifacts:/app/.artifacts" \
  -v "$npm_prefix_host:/npm-global" \
  -i "$IMAGE_NAME" bash -s <<'EOF'
set -euo pipefail

export HOME="$(mktemp -d "/tmp/openclaw-npm-telegram-runtime.XXXXXX")"
export NPM_CONFIG_PREFIX="/npm-global"
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
export ICLAW_NPM_TELEGRAM_REPO_ROOT="/app"

command -v openclaw
openclaw --version

export ICLAW_NPM_TELEGRAM_SUT_COMMAND="$(command -v openclaw)"
node --import tsx scripts/e2e/npm-telegram-live-runner.ts
EOF

echo "published npm Telegram live Docker E2E passed ($PACKAGE_SPEC)"
