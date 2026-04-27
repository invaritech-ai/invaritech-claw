import { PRODUCT_DISPLAY_NAME, resolveDocsSiteRoot } from "../infra/product-branding.js";
import { formatTerminalLink } from "./terminal-link.js";

export function formatDocsLink(
  path: string | undefined | null,
  label?: string,
  opts?: { fallback?: string; force?: boolean },
): string {
  const docsRoot = resolveDocsSiteRoot();
  const trimmed = typeof path === "string" ? path.trim() : "";
  // When a caller has no docsPath, link to the docs root rather than crashing
  // the onboarding/channel-selection flows that pass meta.docsPath through
  // here unguarded. The typed contract says docsPath is required, but a
  // handful of channel plugins and catalog rows leave it unset at runtime.
  const url = trimmed
    ? trimmed.startsWith("http")
      ? trimmed
      : `${docsRoot}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`
    : docsRoot;
  return formatTerminalLink(label ?? url, url, {
    fallback: opts?.fallback ?? url,
    force: opts?.force,
  });
}

/** Root help footer link to CLI documentation. */
export function formatRootCliDocsFooterLink(): string {
  return formatCliDocsLink("/cli");
}

/**
 * Documentation link with an iclaw-branded label. The target URL uses
 * {@link resolveDocsSiteRoot} (override with `ICLAW_DOCS_SITE_ROOT`).
 */
export function formatCliDocsLink(path: string): string {
  const trimmed = path.trim();
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return formatDocsLink(normalized, `${PRODUCT_DISPLAY_NAME} docs (${normalized})`);
}
