import { existsSync, readFileSync } from "node:fs";
import JSON5 from "json5";
import { parseIclawConfig } from "./schema.js";
import type { IclawConfig } from "./types.js";

export function loadIclawConfig(configPath: string): IclawConfig {
  const raw = readFileSync(configPath, "utf8");
  return parseIclawConfig(JSON5.parse(raw));
}

export function loadIclawConfigIfExists(configPath: string): IclawConfig | undefined {
  return existsSync(configPath) ? loadIclawConfig(configPath) : undefined;
}
