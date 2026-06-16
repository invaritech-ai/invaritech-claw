import { z } from "zod";
import type { IclawConfig } from "./types.js";

const SecretRefSchema = z
  .union([
    z.object({ env: z.string().min(1) }).strict(),
    z.object({ value: z.string().min(1) }).strict(),
  ])
  .refine((value) => "env" in value !== "value" in value, {
    message: "secret references must use env or value",
  });

const AgentConfigSchema = z
  .object({
    model: z.string().min(1),
    system: z.string().optional(),
  })
  .strict();

const ProviderConfigSchema = z
  .object({
    openrouter: z
      .object({
        apiKey: SecretRefSchema,
        baseUrl: z.url().optional(),
      })
      .strict()
      .optional(),
    ollama: z
      .object({
        baseUrl: z.url().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .default({});

const ServerConfigSchema = z
  .object({
    apiToken: SecretRefSchema.optional(),
    host: z.string().min(1).default("127.0.0.1"),
    port: z.number().int().min(1).max(65_535).default(32768),
  })
  .strict()
  .default({ host: "127.0.0.1", port: 32768 });

const StorageConfigSchema = z
  .object({
    sqlitePath: z.string().min(1).optional(),
  })
  .strict()
  .default({});

const ModelDefaultsConfigSchema = z
  .object({
    chat: z.string().min(1).default("ollama/gemma4:e4b"),
    memory: z.string().min(1).default("ollama/qwen3:4b"),
    compaction: z.string().min(1).default("ollama/gemma4:e4b"),
    embedding: z.string().min(1).default("ollama/mxbai-embed-large:latest"),
    favorites: z.array(z.string().min(1)).default([]),
    contextWindows: z.record(z.string().min(1), z.number().int().positive()).default({}),
  })
  .strict()
  .default({
    chat: "ollama/gemma4:e4b",
    memory: "ollama/qwen3:4b",
    compaction: "ollama/gemma4:e4b",
    embedding: "ollama/mxbai-embed-large:latest",
    favorites: [],
    contextWindows: {},
  });

const ContextConfigSchema = z
  .object({
    maxTokens: z.number().int().positive().default(32_000),
    responseReservePercent: z.number().min(0).max(100).default(15),
    memoryPercent: z.number().min(0).max(100).default(15),
    summaryPercent: z.number().min(0).max(100).default(20),
    recentMessagesPercent: z.number().min(0).max(100).default(50),
  })
  .strict()
  .default({
    maxTokens: 32_000,
    responseReservePercent: 15,
    memoryPercent: 15,
    summaryPercent: 20,
    recentMessagesPercent: 50,
  });

const CompactionConfigSchema = z
  .object({
    keepRecentMessages: z.number().int().positive().default(12),
  })
  .strict()
  .default({ keepRecentMessages: 12 });

const MemoryConfigSchema = z
  .object({
    curatorPromptPath: z.string().min(1).optional(),
    compactionPromptPath: z.string().min(1).optional(),
  })
  .strict()
  .default({});

const WorkersConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    pollIntervalMs: z.number().int().positive().default(1000),
  })
  .strict()
  .default({ enabled: true, pollIntervalMs: 1000 });

export const IclawConfigSchema = z
  .object({
    agents: z.record(z.string().min(1), AgentConfigSchema).default({}),
    compaction: CompactionConfigSchema,
    context: ContextConfigSchema,
    memory: MemoryConfigSchema,
    models: ModelDefaultsConfigSchema,
    providers: ProviderConfigSchema,
    server: ServerConfigSchema,
    storage: StorageConfigSchema,
    workers: WorkersConfigSchema,
  })
  .strict();

export function parseIclawConfig(input: unknown): IclawConfig {
  return IclawConfigSchema.parse(input);
}
