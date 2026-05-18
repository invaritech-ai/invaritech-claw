import os from "node:os";
import path from "node:path";

export function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.ICLAW_STATE_DIR?.trim() || path.join(os.homedir(), ".iclaw");
}

export function resolveConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.ICLAW_CONFIG_PATH?.trim() || path.join(resolveStateDir(env), "iclaw.json");
}

export function resolveSqlitePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.ICLAW_SQLITE_PATH?.trim() || path.join(resolveStateDir(env), "state.sqlite");
}
