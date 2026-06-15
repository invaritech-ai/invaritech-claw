import { describe, expect, it } from "vitest";
import type { ModelProvider } from "../../src/agent/types.js";
import {
  createConfiguredProviders,
  listConfiguredModels,
  resolveSecretRef,
} from "../../src/server/providers.js";

describe("configured providers", () => {
  it("creates ollama with the default base URL", () => {
    const providers = createConfiguredProviders({
      config: {
        providers: { ollama: {} },
      },
      env: {},
    });

    expect(providers.ollama?.id).toBe("ollama");
  });

  it("creates openrouter from env and literal secret refs", () => {
    expect(resolveSecretRef({ env: "OPENROUTER_API_KEY" }, { OPENROUTER_API_KEY: "env-key" })).toBe(
      "env-key",
    );
    expect(resolveSecretRef({ value: "literal-key" }, {})).toBe("literal-key");

    const providers = createConfiguredProviders({
      config: {
        providers: { openrouter: { apiKey: { env: "OPENROUTER_API_KEY" } } },
      },
      env: { OPENROUTER_API_KEY: "env-key" },
    });

    expect(providers.openrouter?.id).toBe("openrouter");
  });

  it("fails clearly when an env secret is missing", () => {
    expect(() => resolveSecretRef({ env: "OPENROUTER_API_KEY" }, {})).toThrow(
      /missing secret env var: OPENROUTER_API_KEY/u,
    );
  });

  it("model listing returns qualified ollama ids and configured favorites", async () => {
    const ollamaProvider: ModelProvider = {
      id: "ollama",
      async complete() {
        return { text: "" };
      },
      async *stream() {
        yield { type: "done" };
      },
      async listModels() {
        return [{ id: "llama3.2", name: "llama3.2" }, { id: "qwen3:4b" }];
      },
    };
    const openrouterProvider: ModelProvider = {
      id: "openrouter",
      async complete() {
        return { text: "" };
      },
      async *stream() {
        yield { type: "done" };
      },
      async listModels() {
        throw new Error("openrouter catalog should not be fetched");
      },
    };

    await expect(
      listConfiguredModels({
        providers: { ollama: ollamaProvider, openrouter: openrouterProvider },
        config: {
          models: {
            favorites: ["openrouter/anthropic/claude-sonnet-4.6"],
          },
        },
      }),
    ).resolves.toEqual([
      { id: "ollama/llama3.2", name: "llama3.2", providerId: "ollama", modelId: "llama3.2" },
      { id: "ollama/qwen3:4b", providerId: "ollama", modelId: "qwen3:4b" },
      {
        id: "openrouter/anthropic/claude-sonnet-4.6",
        providerId: "openrouter",
        modelId: "anthropic/claude-sonnet-4.6",
      },
    ]);
  });
});
