#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"

IMAGE_NAME="$(docker_e2e_resolve_image "openclaw-openai-image-auth-e2e" ICLAW_OPENAI_IMAGE_AUTH_E2E_IMAGE)"
SKIP_BUILD="${ICLAW_OPENAI_IMAGE_AUTH_E2E_SKIP_BUILD:-0}"

docker_e2e_build_or_reuse "$IMAGE_NAME" openai-image-auth "$ROOT_DIR/scripts/e2e/Dockerfile" "$ROOT_DIR" "" "$SKIP_BUILD"

echo "Running OpenAI image auth Docker E2E..."
run_logged openai-image-auth docker run --rm \
  -e "OPENAI_API_KEY=sk-openclaw-image-auth-e2e" \
  -e "ICLAW_QA_ALLOW_LOCAL_IMAGE_PROVIDER=1" \
  -i "$IMAGE_NAME" bash -lc '
set -euo pipefail
export HOME="$(mktemp -d "/tmp/openclaw-openai-image-auth.XXXXXX")"
export ICLAW_STATE_DIR="$HOME/.openclaw"
export ICLAW_SKIP_CHANNELS=1
export ICLAW_SKIP_GMAIL_WATCHER=1
export ICLAW_SKIP_CRON=1
export ICLAW_SKIP_CANVAS_HOST=1

node --import tsx scripts/e2e/openai-image-auth-docker-client.ts
'
