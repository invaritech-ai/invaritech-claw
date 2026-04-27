import { normalizeOptionalString } from "../shared/string-coerce.js";

export function resolveDaemonContainerContext(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return (
    normalizeOptionalString(env.ICLAW_CONTAINER_HINT) ||
    normalizeOptionalString(env.ICLAW_CONTAINER) ||
    null
  );
}
