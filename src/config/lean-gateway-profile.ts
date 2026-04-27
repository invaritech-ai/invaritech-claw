import type { OpenClawConfig } from "./types.js";

/** Opt-in smaller gateway surface: loopback bind default, plugin allowlist seed, shared-secret auth required. */
export function isLeanGatewayProfileEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ICLAW_LEAN_GATEWAY === "1";
}

/**
 * Personal-assistant / CLI+API+TUI mode: same hardening as lean, plus at runtime only
 * bundled extension directories matching {@link ICLAW_BUNDLED_PLUGIN_DIRS} or (when unset)
 * **ollama** and **openrouter** are discovered — see `src/plugins/bundled-discovery-filter.ts`.
 */
export function isMinimalAssistantDistributionEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.ICLAW_MINIMAL_ASSISTANT === "1";
}

export function isPersonalAssistantHardeningEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isLeanGatewayProfileEnabled(env) || isMinimalAssistantDistributionEnabled(env);
}

/**
 * Default `plugins.allow` when hardening is on and the operator has not set `plugins.allow`.
 * This fork targets **Ollama** and **OpenRouter** as the only bundled LLM providers; add plugins explicitly in config when needed.
 */
export const PERSONAL_ASSISTANT_DEFAULT_PLUGIN_ALLOWLIST: readonly string[] = [
  "ollama",
  "openrouter",
];

/** @deprecated Use {@link PERSONAL_ASSISTANT_DEFAULT_PLUGIN_ALLOWLIST}. */
export const LEAN_GATEWAY_CURATED_PLUGIN_ALLOWLIST = PERSONAL_ASSISTANT_DEFAULT_PLUGIN_ALLOWLIST;

export function applyLeanGatewayRuntimeProfile(
  cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): OpenClawConfig {
  if (!isPersonalAssistantHardeningEnabled(env)) {
    return cfg;
  }

  const gateway =
    cfg.gateway !== undefined ? { ...cfg.gateway } : ({} as NonNullable<OpenClawConfig["gateway"]>);
  if (gateway.bind === undefined) {
    gateway.bind = "loopback";
  }

  const plugins = cfg.plugins !== undefined ? { ...cfg.plugins } : {};
  const allow = plugins.allow;
  const allowUnset = !Array.isArray(allow) || allow.length === 0;
  if (allowUnset) {
    plugins.allow = [...PERSONAL_ASSISTANT_DEFAULT_PLUGIN_ALLOWLIST];
  }

  return {
    ...cfg,
    gateway,
    plugins,
  };
}
