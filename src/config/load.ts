import fs from "node:fs";
import JSON5 from "json5";
import { resolveConfigPath } from "./paths.js";
import { parseIclawConfig } from "./schema.js";
import type { IclawConfig } from "./types.js";

export function loadIclawConfig(env: NodeJS.ProcessEnv = process.env): IclawConfig {
  return loadIclawConfigFromPath(resolveConfigPath(env));
}

export function loadIclawConfigFromPath(configPath: string): IclawConfig {
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON5.parse(raw);
  return parseIclawConfig(parsed);
}
