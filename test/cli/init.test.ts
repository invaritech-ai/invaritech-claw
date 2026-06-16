import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initIclawConfig } from "../../src/cli/init.js";

type FetchCall = {
  input: URL | string;
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function readConfig(configPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
}

describe("iclaw init", () => {
  let tempDir = "";
  let configPath = "";

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "iclaw-init-test-"));
    configPath = path.join(tempDir, "iclaw.json");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes smart ollama defaults from /api/tags", async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = vi.fn(async (input: URL | string) => {
      calls.push({ input });
      return jsonResponse({
        models: [
          { name: "llama3.2:latest" },
          { name: "phi4:latest" },
          { name: "qwen3:4b" },
          { name: "mxbai-embed-large:latest" },
        ],
      });
    });

    await expect(
      initIclawConfig({
        configPath,
        env: {},
        fetchImpl,
      }),
    ).resolves.toMatchObject({ status: "created", configPath });

    const config = readConfig(configPath);
    expect(calls.map((call) => String(call.input))).toEqual(["http://127.0.0.1:11434/api/tags"]);
    expect(config.models).toMatchObject({
      chat: "ollama/phi4:latest",
      memory: "ollama/qwen3:4b",
      compaction: "ollama/phi4:latest",
      embedding: "ollama/mxbai-embed-large:latest",
    });
    expect(config.providers).toEqual({
      ollama: { baseUrl: "http://127.0.0.1:11434" },
    });
  });

  it("falls back to static local defaults when ollama is unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ollama unavailable");
    });

    await initIclawConfig({ configPath, env: {}, fetchImpl });

    expect(readConfig(configPath).models).toMatchObject({
      chat: "ollama/gemma4:e4b",
      memory: "ollama/qwen3:4b",
      compaction: "ollama/gemma4:e4b",
      embedding: "ollama/mxbai-embed-large:latest",
    });
  });

  it("includes openrouter only when OPENROUTER_API_KEY exists", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ models: [] }));

    await initIclawConfig({
      configPath,
      env: { OPENROUTER_API_KEY: "test-key" },
      fetchImpl,
    });

    expect(readConfig(configPath).providers).toEqual({
      ollama: { baseUrl: "http://127.0.0.1:11434" },
      openrouter: { apiKey: { env: "OPENROUTER_API_KEY" } },
    });
  });

  it("does not overwrite config unless force is true", async () => {
    writeFileSync(configPath, '{"sentinel":true}\n');
    const fetchImpl = vi.fn(async () => jsonResponse({ models: [] }));

    await expect(initIclawConfig({ configPath, env: {}, fetchImpl })).resolves.toMatchObject({
      status: "exists",
    });
    expect(readFileSync(configPath, "utf8")).toBe('{"sentinel":true}\n');

    await expect(
      initIclawConfig({ configPath, env: {}, fetchImpl, force: true }),
    ).resolves.toMatchObject({ status: "created" });
    expect(readConfig(configPath).models).toMatchObject({
      chat: "ollama/gemma4:e4b",
    });
  });
});
