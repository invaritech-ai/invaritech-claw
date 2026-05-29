import { describe, expect, it } from "vitest";
import { createConfiguredProviders, resolveSecretRef } from "../../src/server/providers.js";

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
});
