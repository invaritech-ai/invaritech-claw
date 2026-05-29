import os from "node:os";
import path from "node:path";
import type { IclawConfig } from "./types.js";

const DEFAULT_DIR_NAME = ".iclaw";
const DEFAULT_CONFIG_FILE = "iclaw.json";
const DEFAULT_DB_FILE = "state.db";

export function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.ICLAW_STATE_DIR || path.join(os.homedir(), DEFAULT_DIR_NAME);
}

export function resolveConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.ICLAW_CONFIG_PATH || path.join(resolveStateDir(env), DEFAULT_CONFIG_FILE);
}

export function resolveSqlitePath(
  config?: Pick<IclawConfig, "storage">,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    env.ICLAW_SQLITE_PATH ||
    config?.storage.sqlitePath ||
    path.join(resolveStateDir(env), DEFAULT_DB_FILE)
  );
}
