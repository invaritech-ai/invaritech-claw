import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeRun } from "../../src/agent/execute.js";
import { resolveProviderModelRef } from "../../src/agent/model.js";
import type { ModelProvider } from "../../src/agent/types.js";
import { createRunService } from "../../src/runs/service.js";
import { openIclawDatabase } from "../../src/storage/sqlite.js";

describe("provider model resolution", () => {
  it("resolves OpenRouter model refs", () => {
    expect(resolveProviderModelRef("openrouter/anthropic/claude-sonnet-4.6")).toEqual({
      providerId: "openrouter",
      modelId: "anthropic/claude-sonnet-4.6",
    });
  });

  it("resolves Ollama model refs", () => {
    expect(resolveProviderModelRef("ollama/llama3.2")).toEqual({
      providerId: "ollama",
      modelId: "llama3.2",
    });
  });

  it("rejects unknown model provider prefixes", () => {
    expect(() => resolveProviderModelRef("acme/model-x")).toThrow("unknown provider prefix");
  });
});

describe("executeRun", () => {
  it("persists start, delta, and success run events in order", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "iclaw-agent-execute-test-"));
    const dbPath = path.join(tempDir, "state.sqlite");

    try {
      const db = openIclawDatabase(dbPath);
      const runService = createRunService(db);
      const run = runService.createRun({
        agentId: "main",
        triggerType: "api",
        input: { text: "hello" },
      });

      const fakeOpenRouterProvider: ModelProvider = {
        id: "openrouter",
        async *stream() {
          yield { type: "output_text_delta", text: "Hello" };
          yield { type: "output_text_delta", text: " world" };
          yield { type: "done" };
        },
      };

      const result = await executeRun({
        runId: run.id,
        model: "openrouter/anthropic/claude-sonnet-4.6",
        messages: [{ role: "user", content: "say hello" }],
        providers: { openrouter: fakeOpenRouterProvider },
        runService,
      });

      const events = runService.listEvents(run.id);
      expect(events.map((event) => event.type)).toEqual([
        "run.started",
        "model.output.delta",
        "model.output.delta",
        "run.succeeded",
      ]);
      expect(events[1]?.payload).toEqual({ text: "Hello" });
      expect(events[2]?.payload).toEqual({ text: " world" });
      expect(result.status).toBe("succeeded");
      expect(result.result).toEqual({ outputText: "Hello world" });

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
