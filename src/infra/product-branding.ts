import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Operator-facing product name in banners, `--version`, and help text. */
export const PRODUCT_DISPLAY_NAME = "iclaw";

function readPackageRepositoryBrowseBase(): string | null {
  try {
    const pkg = require("../../package.json") as { repository?: { url?: string } };
    const raw = pkg.repository?.url;
    if (typeof raw !== "string" || raw.trim() === "") {
      return null;
    }
    const normalized = raw.replace(/^git\+/i, "").replace(/\.git$/i, "");
    if (normalized.startsWith("https://") || normalized.startsWith("http://")) {
      return normalized;
    }
  } catch {
    // ignore missing package.json (tests / odd installs)
  }
  return null;
}

/**
 * Base URL for documentation links in the CLI (`formatDocsLink`, help footers).
 * Override with `ICLAW_DOCS_SITE_ROOT` (no trailing slash). Defaults to this package's
 * GitHub `docs/` tree when `repository.url` is set.
 */
export function resolveDocsSiteRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ICLAW_DOCS_SITE_ROOT?.trim();
  if (override) {
    return override.replace(/\/$/, "");
  }
  const repoBase = readPackageRepositoryBrowseBase();
  if (repoBase) {
    return `${repoBase}/tree/main/docs`;
  }
  return "https://github.com/openclaw/openclaw/tree/main/docs";
}

/** Absolute URL under {@link resolveDocsSiteRoot} for plain-string messages. */
export function resolveBundledDocsUrl(
  relPath: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const root = resolveDocsSiteRoot(env);
  const trimmed = relPath.trim();
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${root}${normalized}`;
}
