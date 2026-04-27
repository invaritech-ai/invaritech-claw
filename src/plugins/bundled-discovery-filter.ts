import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "../shared/string-coerce.js";

function parseCommaSeparatedIds(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => normalizeOptionalString(entry)?.trim())
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => normalizeLowercaseStringOrEmpty(entry) || entry);
}

/**
 * When set, only these **top-level** directory names under the bundled extensions
 * root are discovered (case-insensitive). Example: `ollama` or `ollama,memory-core`.
 */
export function resolveBundledStockDirectoryAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> | null {
  const explicit = env.ICLAW_BUNDLED_PLUGIN_DIRS?.trim();
  if (explicit) {
    const ids = parseCommaSeparatedIds(explicit);
    if (ids.length === 0) {
      return null;
    }
    return new Set(ids);
  }
  const minimal = normalizeLowercaseStringOrEmpty(env.ICLAW_MINIMAL_ASSISTANT);
  if (minimal === "1" || minimal === "true") {
    return new Set(["ollama", "openrouter"]);
  }
  return null;
}

export function shouldSkipBundledStockDirectory(params: {
  dirName: string;
  applyBundledStockAllowlist: boolean;
  env: NodeJS.ProcessEnv;
}): boolean {
  if (!params.applyBundledStockAllowlist) {
    return false;
  }
  const allow = resolveBundledStockDirectoryAllowlist(params.env);
  if (!allow) {
    return false;
  }
  const key = normalizeLowercaseStringOrEmpty(params.dirName) || params.dirName;
  return !allow.has(key);
}

/** Include in discovery/manifest cache keys so allowlist changes invalidate caches. */
export function bundledStockAllowlistCacheKeyComponent(env: NodeJS.ProcessEnv): string {
  const explicit = env.ICLAW_BUNDLED_PLUGIN_DIRS?.trim();
  if (explicit) {
    return `dirs:${explicit}`;
  }
  const minimal = normalizeLowercaseStringOrEmpty(env.ICLAW_MINIMAL_ASSISTANT);
  if (minimal === "1" || minimal === "true") {
    return "minimal:ollama,openrouter";
  }
  return "all";
}
