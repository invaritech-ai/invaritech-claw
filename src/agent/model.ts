import type { ModelProvider, ProviderId } from "./types.js";

export type ResolvedProviderModel = {
  providerId: ProviderId;
  modelId: string;
};

export type ProviderRegistry = Partial<Record<ProviderId, ModelProvider>>;

const SUPPORTED_PROVIDER_IDS: ReadonlySet<ProviderId> = new Set(["openrouter", "ollama"]);

export function resolveProviderModelRef(modelRef: string): ResolvedProviderModel {
  const trimmed = modelRef.trim();
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex <= 0 || slashIndex === trimmed.length - 1) {
    throw new Error(`invalid model reference: ${modelRef}`);
  }

  const providerPrefix = trimmed.slice(0, slashIndex);
  if (!SUPPORTED_PROVIDER_IDS.has(providerPrefix as ProviderId)) {
    throw new Error(`unknown provider prefix: ${providerPrefix}`);
  }

  const modelId = trimmed.slice(slashIndex + 1).trim();
  if (modelId.length === 0) {
    throw new Error(`invalid model reference: ${modelRef}`);
  }

  return {
    providerId: providerPrefix as ProviderId,
    modelId,
  };
}

export function resolveProviderForModel(
  modelRef: string,
  providers: ProviderRegistry,
): { provider: ModelProvider; model: string } {
  const resolved = resolveProviderModelRef(modelRef);
  const provider = providers[resolved.providerId];
  if (!provider) {
    throw new Error(`provider is not configured: ${resolved.providerId}`);
  }
  return { provider, model: resolved.modelId };
}
