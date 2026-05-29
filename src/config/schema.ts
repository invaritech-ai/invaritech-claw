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

export const IclawConfigSchema = z
  .object({
    agents: z.record(z.string().min(1), AgentConfigSchema).default({}),
    providers: ProviderConfigSchema,
    server: ServerConfigSchema,
    storage: StorageConfigSchema,
  })
  .strict();

export function parseIclawConfig(input: unknown): IclawConfig {
  return IclawConfigSchema.parse(input);
}
