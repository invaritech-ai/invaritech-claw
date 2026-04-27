import { randomUUID } from "node:crypto";
import type { Agent } from "node:http";
import process from "node:process";
import { HttpsProxyAgent } from "https-proxy-agent";
import {
  resolveDebugProxyBlobDir,
  resolveDebugProxyCertDir,
  resolveDebugProxyDbPath,
} from "./paths.js";

export const ICLAW_DEBUG_PROXY_ENABLED = "ICLAW_DEBUG_PROXY_ENABLED";
export const ICLAW_DEBUG_PROXY_URL = "ICLAW_DEBUG_PROXY_URL";
export const ICLAW_DEBUG_PROXY_DB_PATH = "ICLAW_DEBUG_PROXY_DB_PATH";
export const ICLAW_DEBUG_PROXY_BLOB_DIR = "ICLAW_DEBUG_PROXY_BLOB_DIR";
export const ICLAW_DEBUG_PROXY_CERT_DIR = "ICLAW_DEBUG_PROXY_CERT_DIR";
export const ICLAW_DEBUG_PROXY_SESSION_ID = "ICLAW_DEBUG_PROXY_SESSION_ID";
export const ICLAW_DEBUG_PROXY_REQUIRE = "ICLAW_DEBUG_PROXY_REQUIRE";

export type DebugProxySettings = {
  enabled: boolean;
  required: boolean;
  proxyUrl?: string;
  dbPath: string;
  blobDir: string;
  certDir: string;
  sessionId: string;
  sourceProcess: string;
};

let cachedImplicitSessionId: string | undefined;

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function resolveDebugProxySettings(
  env: NodeJS.ProcessEnv = process.env,
): DebugProxySettings {
  const enabled = isTruthy(env[ICLAW_DEBUG_PROXY_ENABLED]);
  const explicitSessionId = env[ICLAW_DEBUG_PROXY_SESSION_ID]?.trim() || undefined;
  const sessionId = explicitSessionId ?? (cachedImplicitSessionId ??= randomUUID());
  return {
    enabled,
    required: isTruthy(env[ICLAW_DEBUG_PROXY_REQUIRE]),
    proxyUrl: env[ICLAW_DEBUG_PROXY_URL]?.trim() || undefined,
    dbPath: env[ICLAW_DEBUG_PROXY_DB_PATH]?.trim() || resolveDebugProxyDbPath(env),
    blobDir: env[ICLAW_DEBUG_PROXY_BLOB_DIR]?.trim() || resolveDebugProxyBlobDir(env),
    certDir: env[ICLAW_DEBUG_PROXY_CERT_DIR]?.trim() || resolveDebugProxyCertDir(env),
    sessionId,
    sourceProcess: "openclaw",
  };
}

export function applyDebugProxyEnv(
  env: NodeJS.ProcessEnv,
  params: {
    proxyUrl: string;
    sessionId: string;
    dbPath?: string;
    blobDir?: string;
    certDir?: string;
  },
): NodeJS.ProcessEnv {
  return {
    ...env,
    [ICLAW_DEBUG_PROXY_ENABLED]: "1",
    [ICLAW_DEBUG_PROXY_REQUIRE]: "1",
    [ICLAW_DEBUG_PROXY_URL]: params.proxyUrl,
    [ICLAW_DEBUG_PROXY_DB_PATH]: params.dbPath ?? resolveDebugProxyDbPath(env),
    [ICLAW_DEBUG_PROXY_BLOB_DIR]: params.blobDir ?? resolveDebugProxyBlobDir(env),
    [ICLAW_DEBUG_PROXY_CERT_DIR]: params.certDir ?? resolveDebugProxyCertDir(env),
    [ICLAW_DEBUG_PROXY_SESSION_ID]: params.sessionId,
    HTTP_PROXY: params.proxyUrl,
    HTTPS_PROXY: params.proxyUrl,
    ALL_PROXY: params.proxyUrl,
  };
}

export function createDebugProxyWebSocketAgent(settings: DebugProxySettings): Agent | undefined {
  if (!settings.enabled || !settings.proxyUrl) {
    return undefined;
  }
  return new HttpsProxyAgent(settings.proxyUrl);
}

export function resolveEffectiveDebugProxyUrl(configuredProxyUrl?: string): string | undefined {
  const explicit = configuredProxyUrl?.trim();
  if (explicit) {
    return explicit;
  }
  const settings = resolveDebugProxySettings();
  return settings.enabled ? settings.proxyUrl : undefined;
}
