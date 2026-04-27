const COMMON_LIVE_ENV_NAMES = [
  "ICLAW_AGENT_RUNTIME",
  "ICLAW_CONFIG_PATH",
  "ICLAW_GATEWAY_TOKEN",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "ICLAW_SKIP_BROWSER_CONTROL_SERVER",
  "ICLAW_SKIP_CANVAS_HOST",
  "ICLAW_SKIP_CHANNELS",
  "ICLAW_SKIP_CRON",
  "ICLAW_SKIP_GMAIL_WATCHER",
  "ICLAW_STATE_DIR",
] as const;

export type LiveEnvSnapshot = Record<string, string | undefined>;

export function snapshotLiveEnv(extraNames: readonly string[] = []): LiveEnvSnapshot {
  const snapshot: LiveEnvSnapshot = {};
  for (const name of [...COMMON_LIVE_ENV_NAMES, ...extraNames]) {
    snapshot[name] = process.env[name];
  }
  return snapshot;
}

export function restoreLiveEnv(snapshot: LiveEnvSnapshot): void {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}
