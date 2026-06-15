import { resolveProviderModelRef, type ProviderRegistry } from "../agent/model.js";
import type { ProviderId } from "../agent/types.js";
import type { SecretRef, IclawConfig } from "../config/types.js";
import { createOllamaProvider } from "../providers/ollama/index.js";
import { createOpenRouterProvider } from "../providers/openrouter/index.js";

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

export type ListedProviderModel = {
  id: string;
  providerId: ProviderId;
  modelId: string;
  name?: string;
};

type ModelListConfig = {
  models?: {
    favorites?: string[];
  };
};

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

export async function listConfiguredModels(input: {
  providers: ProviderRegistry;
  config?: ModelListConfig;
}): Promise<ListedProviderModel[]> {
  const listedModels: ListedProviderModel[] = [];
  const ollamaModels = (await input.providers.ollama?.listModels?.()) ?? [];

  for (const model of ollamaModels) {
    const modelId = model.id.trim();
    if (modelId.length === 0) {
      continue;
    }
    listedModels.push({
      id: `ollama/${modelId}`,
      providerId: "ollama",
      modelId,
      ...(model.name ? { name: model.name } : {}),
    });
  }

  for (const favorite of input.config?.models?.favorites ?? []) {
    const modelRef = favorite.trim();
    if (modelRef.length === 0) {
      continue;
    }
    const resolved = resolveProviderModelRef(modelRef);
    listedModels.push({
      id: modelRef,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
    });
  }

  return listedModels;
}
