#!/usr/bin/env bash
set -euo pipefail

cd /repo

export ICLAW_STATE_DIR="/tmp/openclaw-test"
export ICLAW_CONFIG_PATH="${ICLAW_STATE_DIR}/openclaw.json"

echo "==> Build"
if ! pnpm build >/tmp/openclaw-cleanup-build.log 2>&1; then
  cat /tmp/openclaw-cleanup-build.log
  exit 1
fi

echo "==> Seed state"
mkdir -p "${ICLAW_STATE_DIR}/credentials"
mkdir -p "${ICLAW_STATE_DIR}/agents/main/sessions"
echo '{}' >"${ICLAW_CONFIG_PATH}"
echo 'creds' >"${ICLAW_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${ICLAW_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
if ! pnpm openclaw reset --scope config+creds+sessions --yes --non-interactive >/tmp/openclaw-cleanup-reset.log 2>&1; then
  cat /tmp/openclaw-cleanup-reset.log
  exit 1
fi

test ! -f "${ICLAW_CONFIG_PATH}"
test ! -d "${ICLAW_STATE_DIR}/credentials"
test ! -d "${ICLAW_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${ICLAW_STATE_DIR}/credentials"
echo '{}' >"${ICLAW_CONFIG_PATH}"

echo "==> Uninstall (state only)"
if ! pnpm openclaw uninstall --state --yes --non-interactive >/tmp/openclaw-cleanup-uninstall.log 2>&1; then
  cat /tmp/openclaw-cleanup-uninstall.log
  exit 1
fi

test ! -d "${ICLAW_STATE_DIR}"

echo "OK"
