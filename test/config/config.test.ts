import { describe, expect, it } from "vitest";
import { parseIclawConfig } from "../../src/config/schema.js";

describe("iclaw config", () => {
  it("accepts the minimal v1 config", () => {
    const parsed = parseIclawConfig({
      agents: {
        main: {
          model: "openrouter/anthropic/claude-sonnet-4.6",
          system: "You are precise.",
        },
      },
      providers: {
        openrouter: { apiKey: { env: "OPENROUTER_API_KEY" } },
        ollama: { baseUrl: "http://127.0.0.1:11434" },
      },
      server: { host: "127.0.0.1", port: 32768 },
    });

    expect(parsed.agents.main.model).toBe("openrouter/anthropic/claude-sonnet-4.6");
    expect(parsed.models.chat).toBe("ollama/gemma4:e4b");
    expect(parsed.models.memory).toBe("ollama/qwen3:4b");
    expect(parsed.models.compaction).toBe("ollama/gemma4:e4b");
    expect(parsed.models.embedding).toBe("ollama/mxbai-embed-large:latest");
    expect(parsed.context).toMatchObject({
      maxTokens: 32_000,
      responseReservePercent: 15,
      memoryPercent: 15,
      summaryPercent: 20,
      recentMessagesPercent: 50,
    });
    expect(parsed.compaction.keepRecentMessages).toBe(12);
    expect(parsed.workers).toEqual({ enabled: true, pollIntervalMs: 1000 });
  });

  it("rejects unknown providers", () => {
    expect(() =>
      parseIclawConfig({
        agents: { main: { model: "other/model" } },
        providers: { other: {} },
      }),
    ).toThrow(/provider/i);
  });

  it("accepts thread memory v1 config overrides", () => {
    const parsed = parseIclawConfig({
      models: {
        chat: "ollama/phi4:latest",
        memory: "ollama/qwen3:4b",
        compaction: "ollama/gemma4:e4b",
        embedding: "ollama/mxbai-embed-large:latest",
        favorites: ["openrouter/anthropic/claude-sonnet-4.6"],
        contextWindows: { "ollama/phi4:latest": 64000 },
      },
      context: {
        maxTokens: 64000,
        responseReservePercent: 20,
        memoryPercent: 10,
        summaryPercent: 20,
        recentMessagesPercent: 50,
      },
      compaction: { keepRecentMessages: 8 },
      memory: {
        curatorPromptPath: "/tmp/memory.md",
        compactionPromptPath: "/tmp/compact.md",
      },
      workers: { enabled: false, pollIntervalMs: 2500 },
    });

    expect(parsed.models.favorites).toEqual(["openrouter/anthropic/claude-sonnet-4.6"]);
    expect(parsed.models.contextWindows["ollama/phi4:latest"]).toBe(64000);
    expect(parsed.workers.enabled).toBe(false);
  });
});
