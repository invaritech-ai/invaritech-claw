import os from "node:os";
import path from "node:path";
import { resolveHomeRelativePath, resolveRequiredHomeDir } from "../infra/home-dir.js";
import type { OpenClawConfig } from "./types.js";

/**
 * Nix mode detection: When ICLAW_NIX_MODE=1, the gateway is running under Nix.
 * In this mode:
 * - No auto-install flows should be attempted
 * - Missing dependencies should produce actionable Nix-specific error messages
 * - Config is managed externally (read-only from Nix perspective)
 */
export function resolveIsNixMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ICLAW_NIX_MODE === "1";
}

export const isNixMode = resolveIsNixMode();

/**
 * Legacy compatibility switch retained for config/tooling callers that still check it.
 * Runtime path resolution is canonical regardless: `~/.iclaw/iclaw.json` unless
 * `ICLAW_STATE_DIR` or `ICLAW_CONFIG_PATH` is set.
 *
 * Intentionally does not import `infra/env` (matches `isTruthyEnvValue`) to avoid a
 * load cycle with `utils` → `paths` → `env` → … → `utils`.
 */
export function resolveIclawStrictHome(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.ICLAW_STRICT_HOME;
  if (typeof raw !== "string") {
    return false;
  }
  switch (raw.trim().toLowerCase()) {
    case "1":
    case "on":
    case "true":
    case "yes":
      return true;
    default:
      return false;
  }
}

// Legacy state dirs are migration sources only. Runtime defaults stay canonical.
const LEGACY_STATE_DIRNAMES = [".clawdbot", ".openclaw"] as const;
const NEW_STATE_DIRNAME = ".iclaw";
const CONFIG_FILENAME = "iclaw.json";

function resolveDefaultHomeDir(): string {
  return resolveRequiredHomeDir(process.env, os.homedir);
}

/** Build a homedir thunk that respects ICLAW_HOME for the given env. */
function envHomedir(env: NodeJS.ProcessEnv): () => string {
  return () => resolveRequiredHomeDir(env, os.homedir);
}

function legacyStateDirs(homedir: () => string = resolveDefaultHomeDir): string[] {
  return LEGACY_STATE_DIRNAMES.map((dir) => path.join(homedir(), dir));
}

function newStateDir(homedir: () => string = resolveDefaultHomeDir): string {
  return path.join(homedir(), NEW_STATE_DIRNAME);
}

export function resolveLegacyStateDir(homedir: () => string = resolveDefaultHomeDir): string {
  return legacyStateDirs(homedir)[0] ?? newStateDir(homedir);
}

export function resolveLegacyStateDirs(homedir: () => string = resolveDefaultHomeDir): string[] {
  return legacyStateDirs(homedir);
}

export function resolveNewStateDir(homedir: () => string = resolveDefaultHomeDir): string {
  return newStateDir(homedir);
}

/**
 * State directory for mutable data (sessions, logs, caches).
 * Can be overridden via ICLAW_STATE_DIR.
 * Default: ~/.iclaw.
 */
export function resolveStateDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = envHomedir(env),
): string {
  const effectiveHomedir = () => resolveRequiredHomeDir(env, homedir);
  const override = env.ICLAW_STATE_DIR?.trim();
  if (override) {
    return resolveUserPath(override, env, effectiveHomedir);
  }
  return newStateDir(effectiveHomedir);
}

function resolveUserPath(
  input: string,
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = envHomedir(env),
): string {
  return resolveHomeRelativePath(input, { env, homedir });
}

export const STATE_DIR = resolveStateDir();

/**
 * Config file path (JSON or JSON5).
 * Can be overridden via ICLAW_CONFIG_PATH.
 * Default: ~/.iclaw/iclaw.json (or $ICLAW_STATE_DIR/iclaw.json)
 */
export function resolveCanonicalConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(env, envHomedir(env)),
): string {
  const override = env.ICLAW_CONFIG_PATH?.trim();
  if (override) {
    return resolveUserPath(override, env, envHomedir(env));
  }
  return path.join(stateDir, CONFIG_FILENAME);
}

/**
 * Resolve the active config path from canonical iclaw locations and explicit overrides.
 */
export function resolveConfigPathCandidate(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = envHomedir(env),
): string {
  return resolveCanonicalConfigPath(env, resolveStateDir(env, homedir));
}

/**
 * Active config path.
 */
export function resolveConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(env, envHomedir(env)),
  homedir: () => string = envHomedir(env),
): string {
  const override = env.ICLAW_CONFIG_PATH?.trim();
  if (override) {
    return resolveUserPath(override, env, homedir);
  }
  if (env.ICLAW_TEST_FAST === "1") {
    return path.join(stateDir, CONFIG_FILENAME);
  }
  return path.join(stateDir, CONFIG_FILENAME);
}

export function resolveSqlitePath(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(env, envHomedir(env)),
): string {
  const override = env.ICLAW_SQLITE_PATH?.trim();
  if (override) {
    return resolveUserPath(override, env, envHomedir(env));
  }
  return path.join(stateDir, "state.sqlite");
}

export const CONFIG_PATH = resolveConfigPathCandidate();

/**
 * Resolve default config path candidates across default locations.
 * Order: explicit config path -> state-dir-derived canonical path -> new default.
 */
export function resolveDefaultConfigCandidates(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = envHomedir(env),
): string[] {
  const effectiveHomedir = () => resolveRequiredHomeDir(env, homedir);
  const explicit = env.ICLAW_CONFIG_PATH?.trim();
  if (explicit) {
    return [resolveUserPath(explicit, env, effectiveHomedir)];
  }

  if (resolveIclawStrictHome(env)) {
    return [path.join(resolveStateDir(env, homedir), CONFIG_FILENAME)];
  }

  const stateDirOverride = env.ICLAW_STATE_DIR?.trim();
  if (stateDirOverride) {
    const resolved = resolveUserPath(stateDirOverride, env, effectiveHomedir);
    return [path.join(resolved, CONFIG_FILENAME)];
  }

  return [path.join(newStateDir(effectiveHomedir), CONFIG_FILENAME)];
}

/** Default gateway listen port when unset in config and env. */
export const DEFAULT_GATEWAY_PORT = 32768;

/**
 * Gateway lock directory (ephemeral).
 * Default: os.tmpdir()/iclaw-<uid> (uid suffix when available).
 */
export function resolveGatewayLockDir(tmpdir: () => string = os.tmpdir): string {
  const base = tmpdir();
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  const suffix = uid != null ? `iclaw-${uid}` : "iclaw";
  return path.join(base, suffix);
}

const OAUTH_FILENAME = "oauth.json";

/**
 * OAuth credentials storage directory.
 *
 * Precedence:
 * - `ICLAW_OAUTH_DIR` (explicit override)
 * - `$*_STATE_DIR/credentials` (canonical server/default)
 */
export function resolveOAuthDir(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(env, envHomedir(env)),
): string {
  const override = env.ICLAW_OAUTH_DIR?.trim();
  if (override) {
    return resolveUserPath(override, env, envHomedir(env));
  }
  return path.join(stateDir, "credentials");
}

export function resolveOAuthPath(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(env, envHomedir(env)),
): string {
  return path.join(resolveOAuthDir(env, stateDir), OAUTH_FILENAME);
}

function parseGatewayPortEnvValue(raw: string | undefined): number | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  // Docker Compose publish strings can leak into host CLI env loading via repo `.env`,
  // for example `127.0.0.1:18789` or `[::1]:18789`. Accept only explicit host:port forms.
  const bracketedIpv6Match = trimmed.match(/^\[[^\]]+\]:(\d+)$/);
  if (bracketedIpv6Match?.[1]) {
    const parsed = Number.parseInt(bracketedIpv6Match[1], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const firstColon = trimmed.indexOf(":");
  const lastColon = trimmed.lastIndexOf(":");
  if (firstColon <= 0 || firstColon !== lastColon) {
    return null;
  }
  const suffix = trimmed.slice(firstColon + 1);
  if (!/^\d+$/.test(suffix)) {
    return null;
  }
  const parsed = Number.parseInt(suffix, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveGatewayPort(
  cfg?: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const envRaw = env.ICLAW_GATEWAY_PORT?.trim();
  const envPort = parseGatewayPortEnvValue(envRaw);
  if (envPort !== null) {
    return envPort;
  }
  const configPort = cfg?.gateway?.port;
  if (typeof configPort === "number" && Number.isFinite(configPort)) {
    if (configPort > 0) {
      return configPort;
    }
  }
  return DEFAULT_GATEWAY_PORT;
}
