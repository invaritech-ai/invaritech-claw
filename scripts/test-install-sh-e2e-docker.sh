#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${ICLAW_INSTALL_E2E_IMAGE:-openclaw-install-e2e:local}"
INSTALL_URL="${ICLAW_INSTALL_URL:-https://openclaw.bot/install.sh}"

OPENAI_API_KEY="${OPENAI_API_KEY:-}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
ANTHROPIC_API_TOKEN="${ANTHROPIC_API_TOKEN:-}"
ICLAW_E2E_MODELS="${ICLAW_E2E_MODELS:-}"

echo "==> Build image: $IMAGE_NAME"
docker build \
  -t "$IMAGE_NAME" \
  -f "$ROOT_DIR/scripts/docker/install-sh-e2e/Dockerfile" \
  "$ROOT_DIR/scripts/docker"

echo "==> Run E2E installer test"
docker run --rm \
  -e ICLAW_INSTALL_URL="$INSTALL_URL" \
  -e ICLAW_INSTALL_TAG="${ICLAW_INSTALL_TAG:-latest}" \
  -e ICLAW_E2E_MODELS="$ICLAW_E2E_MODELS" \
  -e ICLAW_INSTALL_E2E_PREVIOUS="${ICLAW_INSTALL_E2E_PREVIOUS:-}" \
  -e ICLAW_INSTALL_E2E_SKIP_PREVIOUS="${ICLAW_INSTALL_E2E_SKIP_PREVIOUS:-0}" \
  -e ICLAW_INSTALL_E2E_AGENT_TURN_TIMEOUT_SECONDS="${ICLAW_INSTALL_E2E_AGENT_TURN_TIMEOUT_SECONDS:-600}" \
  -e ICLAW_NO_ONBOARD=1 \
  -e OPENAI_API_KEY \
  -e ANTHROPIC_API_KEY \
  -e ANTHROPIC_API_TOKEN \
  "$IMAGE_NAME"
