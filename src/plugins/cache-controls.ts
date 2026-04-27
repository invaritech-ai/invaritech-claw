import { normalizeOptionalString } from "../shared/string-coerce.js";

export const DEFAULT_PLUGIN_DISCOVERY_CACHE_MS = 1000;
export const DEFAULT_PLUGIN_MANIFEST_CACHE_MS = 1000;

export function shouldUsePluginSnapshotCache(env: NodeJS.ProcessEnv): boolean {
  if (normalizeOptionalString(env.ICLAW_DISABLE_PLUGIN_DISCOVERY_CACHE)) {
    return false;
  }
  if (normalizeOptionalString(env.ICLAW_DISABLE_PLUGIN_MANIFEST_CACHE)) {
    return false;
  }
  const discoveryCacheMs = normalizeOptionalString(env.ICLAW_PLUGIN_DISCOVERY_CACHE_MS);
  if (discoveryCacheMs === "0") {
    return false;
  }
  const manifestCacheMs = normalizeOptionalString(env.ICLAW_PLUGIN_MANIFEST_CACHE_MS);
  if (manifestCacheMs === "0") {
    return false;
  }
  return true;
}

export function resolvePluginCacheMs(rawValue: string | undefined, defaultMs: number): number {
  const raw = normalizeOptionalString(rawValue);
  if (raw === "" || raw === "0") {
    return 0;
  }
  if (!raw) {
    return defaultMs;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return defaultMs;
  }
  return Math.max(0, parsed);
}

export function resolvePluginSnapshotCacheTtlMs(env: NodeJS.ProcessEnv): number {
  const discoveryCacheMs = resolvePluginCacheMs(
    env.ICLAW_PLUGIN_DISCOVERY_CACHE_MS,
    DEFAULT_PLUGIN_DISCOVERY_CACHE_MS,
  );
  const manifestCacheMs = resolvePluginCacheMs(
    env.ICLAW_PLUGIN_MANIFEST_CACHE_MS,
    DEFAULT_PLUGIN_MANIFEST_CACHE_MS,
  );
  return Math.min(discoveryCacheMs, manifestCacheMs);
}

export function buildPluginSnapshotCacheEnvKey(env: NodeJS.ProcessEnv): string {
  return JSON.stringify({
    ICLAW_BUNDLED_PLUGINS_DIR: env.ICLAW_BUNDLED_PLUGINS_DIR ?? "",
    ICLAW_DISABLE_PLUGIN_DISCOVERY_CACHE: env.ICLAW_DISABLE_PLUGIN_DISCOVERY_CACHE ?? "",
    ICLAW_DISABLE_PLUGIN_MANIFEST_CACHE: env.ICLAW_DISABLE_PLUGIN_MANIFEST_CACHE ?? "",
    ICLAW_PLUGIN_DISCOVERY_CACHE_MS: env.ICLAW_PLUGIN_DISCOVERY_CACHE_MS ?? "",
    ICLAW_PLUGIN_MANIFEST_CACHE_MS: env.ICLAW_PLUGIN_MANIFEST_CACHE_MS ?? "",
    ICLAW_HOME: env.ICLAW_HOME ?? "",
    ICLAW_STATE_DIR: env.ICLAW_STATE_DIR ?? "",
    ICLAW_CONFIG_PATH: env.ICLAW_CONFIG_PATH ?? "",
    HOME: env.HOME ?? "",
    USERPROFILE: env.USERPROFILE ?? "",
    VITEST: env.VITEST ?? "",
  });
}
