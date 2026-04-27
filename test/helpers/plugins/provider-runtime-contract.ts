import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ProviderPlugin } from "../../../src/plugins/types.js";
import { registerProviderPlugin, requireRegisteredProvider } from "./provider-registration.js";

const CONTRACT_SETUP_TIMEOUT_MS = 300_000;

type ProviderRuntimeContractFixture = {
  providerIds: string[];
  pluginId: string;
  name: string;
  load: ProviderRuntimeContractPluginLoader;
};

export type ProviderRuntimeContractPluginLoader = () => Promise<{
  default: Parameters<typeof registerProviderPlugin>[0]["plugin"];
}>;

function installRuntimeHooks(fixtures: readonly ProviderRuntimeContractFixture[]) {
  const providers = new Map<string, ProviderPlugin>();
  let loadPromise: Promise<void> | null = null;

  function requireProviderContractProvider(providerId: string): ProviderPlugin {
    const provider = providers.get(providerId);
    if (!provider) {
      throw new Error(`provider runtime contract fixture missing for ${providerId}`);
    }
    return provider;
  }

  async function ensureProvidersLoaded() {
    if (!loadPromise) {
      loadPromise = (async () => {
        providers.clear();
        const registeredFixtures = await Promise.all(
          fixtures.map(async (fixture) => {
            const plugin = await fixture.load();
            return {
              fixture,
              providers: (
                await registerProviderPlugin({
                  plugin: plugin.default,
                  id: fixture.pluginId,
                  name: fixture.name,
                })
              ).providers,
            };
          }),
        );
        for (const { fixture, providers: registeredProviders } of registeredFixtures) {
          for (const providerId of fixture.providerIds) {
            providers.set(
              providerId,
              requireRegisteredProvider(registeredProviders, providerId, "provider"),
            );
          }
        }
      })();
    }

    await loadPromise;
  }

  beforeAll(async () => {
    await ensureProvidersLoaded();
  }, CONTRACT_SETUP_TIMEOUT_MS);

  beforeEach(() => {}, CONTRACT_SETUP_TIMEOUT_MS);

  return requireProviderContractProvider;
}

export function describeOpenRouterProviderRuntimeContract(
  load: ProviderRuntimeContractPluginLoader,
) {
  describe("openrouter provider runtime contract", { timeout: CONTRACT_SETUP_TIMEOUT_MS }, () => {
    const requireProviderContractProvider = installRuntimeHooks([
      { providerIds: ["openrouter"], pluginId: "openrouter", name: "OpenRouter", load },
    ]);

    it("owns dynamic OpenRouter model defaults", () => {
      const provider = requireProviderContractProvider("openrouter");
      const model = provider.resolveDynamicModel?.({
        provider: "openrouter",
        modelId: "x-ai/grok-4-1-fast",
        modelRegistry: {
          find: () => null,
        } as never,
      });

      expect(model).toMatchObject({
        id: "x-ai/grok-4-1-fast",
        provider: "openrouter",
        api: "openai-completions",
        baseUrl: "https://openrouter.ai/api/v1",
        maxTokens: 8192,
      });
    });
  });
}
