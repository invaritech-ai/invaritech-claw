import type { ProviderRegistry } from "../agent/model.js";
import type { SecretRef, IclawConfig } from "../config/types.js";
import { createOllamaProvider } from "../providers/ollama/index.js";
import { createOpenRouterProvider } from "../providers/openrouter/index.js";

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

export function resolveSecretRef(secret: SecretRef, env: NodeJS.ProcessEnv = process.env): string {
  if ("value" in secret) {
    return secret.value;
  }

  const value = env[secret.env]?.trim();
  if (!value) {
    throw new Error(`missing secret env var: ${secret.env}`);
  }
  return value;
}

export function createConfiguredProviders(input: {
  config: Pick<IclawConfig, "providers">;
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
}): ProviderRegistry {
  const providers: ProviderRegistry = {};
  const env = input.env ?? process.env;

  if (input.config.providers.ollama) {
    providers.ollama = createOllamaProvider({
      baseUrl: input.config.providers.ollama.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
      fetchFn: input.fetchFn,
    });
  }

  if (input.config.providers.openrouter) {
    providers.openrouter = createOpenRouterProvider({
      apiKey: resolveSecretRef(input.config.providers.openrouter.apiKey, env),
      baseUrl: input.config.providers.openrouter.baseUrl,
      fetchFn: input.fetchFn,
    });
  }

  return providers;
}
