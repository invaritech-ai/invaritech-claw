import { describe, expect, it } from "vitest";
import { parseIclawConfig } from "../../src/config/schema.js";

describe("iclaw config", () => {
  it("accepts the minimal v1 config", () => {
    const parsed = parseIclawConfig({
      agents: {
        main: {
          model: "openrouter/anthropic/claude-sonnet-4.6",
          system: "You are precise.",
          tools: ["http.request"],
        },
      },
      providers: {
        openrouter: { apiKey: { env: "OPENROUTER_API_KEY" } },
        ollama: { baseUrl: "http://127.0.0.1:11434" },
      },
      server: { host: "127.0.0.1", port: 32768 },
    });

    expect(parsed.agents.main.model).toBe("openrouter/anthropic/claude-sonnet-4.6");
  });

  it("rejects unknown providers", () => {
    expect(() =>
      parseIclawConfig({
        agents: { main: { model: "other/model", tools: [] } },
        providers: { other: {} },
      }),
    ).toThrow(/provider/i);
  });
});
