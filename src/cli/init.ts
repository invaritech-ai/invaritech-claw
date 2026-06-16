import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseIclawConfig } from "../config/schema.js";
import type { IclawConfig } from "../config/types.js";

const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const CHAT_MODEL_PREFERENCES = [
  "gemma4:e4b",
  "phi4:latest",
  "mistral:latest",
  "llama3.2:latest",
] as const;
const MEMORY_MODEL_PREFERENCES = [
  "qwen3:4b",
  "granite4:latest",
  "llama3.2:latest",
  "qwen3:0.6b",
] as const;
const EMBEDDING_MODEL = "mxbai-embed-large:latest";

export type InitIclawConfigResult = {
  configPath: string;
  status: "created" | "exists";
};

type InitFetch = (input: string) => Promise<Response>;

type InitIclawConfigInput = {
  configPath: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  fetchImpl?: InitFetch;
  force?: boolean;
};

export function createStaticDefaultConfig(): IclawConfig {
  return {
    agents: {},
    compaction: {
      keepRecentMessages: 12,
    },
    context: {
      maxTokens: 32_000,
      responseReservePercent: 15,
      memoryPercent: 15,
      summaryPercent: 20,
      recentMessagesPercent: 50,
    },
    memory: {},
    models: {
      chat: `ollama/${CHAT_MODEL_PREFERENCES[0]}`,
      memory: `ollama/${MEMORY_MODEL_PREFERENCES[0]}`,
      compaction: `ollama/${CHAT_MODEL_PREFERENCES[0]}`,
      embedding: `ollama/${EMBEDDING_MODEL}`,
      favorites: [],
      contextWindows: {},
    },
    providers: {
      ollama: { baseUrl: OLLAMA_BASE_URL },
    },
    server: {
      host: "127.0.0.1",
      port: 32768,
    },
    storage: {},
    workers: {
      enabled: true,
      pollIntervalMs: 1000,
    },
  };
}

function isTagListPayload(value: unknown): value is { models: { name: string }[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "models" in value &&
    Array.isArray(value.models) &&
    value.models.every(
      (model) =>
        typeof model === "object" &&
        model !== null &&
        "name" in model &&
        typeof model.name === "string",
    )
  );
}

function chooseInstalledModel(
  preferences: readonly string[],
  installedModels: Set<string>,
): string {
  return preferences.find((model) => installedModels.has(model)) ?? preferences[0]!;
}

async function listInstalledOllamaModels(fetchImpl: InitFetch): Promise<Set<string>> {
  try {
    const response = await fetchImpl(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) {
      return new Set();
    }
    const payload: unknown = await response.json();
    if (!isTagListPayload(payload)) {
      return new Set();
    }
    return new Set(payload.models.map((model) => model.name));
  } catch {
    return new Set();
  }
}

export async function buildInitialIclawConfig(
  input: {
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
    fetchImpl?: InitFetch;
  } = {},
): Promise<IclawConfig> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const installedModels = await listInstalledOllamaModels(fetchImpl);
  const chatModel = chooseInstalledModel(CHAT_MODEL_PREFERENCES, installedModels);
  const memoryModel = chooseInstalledModel(MEMORY_MODEL_PREFERENCES, installedModels);
  const config = createStaticDefaultConfig();

  config.models.chat = `ollama/${chatModel}`;
  config.models.memory = `ollama/${memoryModel}`;
  config.models.compaction = `ollama/${chatModel}`;

  if (env.OPENROUTER_API_KEY) {
    config.providers.openrouter = { apiKey: { env: "OPENROUTER_API_KEY" } };
  }

  return parseIclawConfig(config);
}

export const DEFAULT_CONFIG = parseIclawConfig(createStaticDefaultConfig());

export async function initIclawConfig(input: InitIclawConfigInput): Promise<InitIclawConfigResult> {
  if (existsSync(input.configPath) && !input.force) {
    return { status: "exists", configPath: input.configPath };
  }

  const config = await buildInitialIclawConfig({
    env: input.env,
    fetchImpl: input.fetchImpl,
  });
  mkdirSync(path.dirname(input.configPath), { recursive: true });
  writeFileSync(input.configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { status: "created", configPath: input.configPath };
}
