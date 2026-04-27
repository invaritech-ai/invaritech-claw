export const ICLAW_OWNER_ONLY_CORE_TOOL_NAMES = ["cron", "gateway", "nodes"] as const;

const ICLAW_OWNER_ONLY_CORE_TOOL_NAME_SET: ReadonlySet<string> = new Set(
  ICLAW_OWNER_ONLY_CORE_TOOL_NAMES,
);

export function isOpenClawOwnerOnlyCoreToolName(toolName: string): boolean {
  return ICLAW_OWNER_ONLY_CORE_TOOL_NAME_SET.has(toolName);
}
