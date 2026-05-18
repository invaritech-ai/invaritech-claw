import { z } from "zod";
import type { IclawConfig } from "./types.js";

const SecretRefSchema = z.object({ env: z.string().min(1) }).strict();
const FileSecretRefSchema = z.object({ file: z.string().min(1) }).strict();
const SecretInputSchema = z.union([SecretRefSchema, FileSecretRefSchema]);

const AgentConfigSchema = z
  .object({
    model: z.string().min(1),
    system: z.string().min(1).optional(),
    tools: z.array(z.string().min(1)),
  })
  .strict();

const OpenRouterProviderSchema = z
  .object({
    apiKey: SecretInputSchema,
  })
  .strict();

const OllamaProviderSchema = z
  .object({
    baseUrl: z.string().url(),
  })
  .strict();

const ProvidersSchema = z
  .object({
    openrouter: OpenRouterProviderSchema,
    ollama: OllamaProviderSchema,
  })
  .strict();

const ApiAllowRuleSchema = z
  .object({
    method: z.string().min(1),
    path: z.string().min(1),
  })
  .strict();

const ApiAuthSchema = z
  .object({
    bearer: SecretInputSchema.optional(),
  })
  .strict();

const ApiConfigSchema = z
  .object({
    baseUrl: z.string().url(),
    auth: ApiAuthSchema.optional(),
    allow: z.array(ApiAllowRuleSchema).optional(),
  })
  .strict();

const WebhookConfigSchema = z
  .object({
    path: z.string().min(1),
    agentId: z.string().min(1),
    secret: SecretInputSchema.optional(),
    idempotency: z
      .object({
        header: z.string().min(1),
      })
      .strict()
      .optional(),
    approvalMode: z.enum(["fail", "ask"]).optional(),
  })
  .strict();

const ScheduleConfigSchema = z
  .object({
    agentId: z.string().min(1),
    schedule: z
      .object({
        cron: z.string().min(1),
        timezone: z.string().min(1).optional(),
      })
      .strict(),
    input: z.record(z.string(), z.unknown()).optional(),
    approvalMode: z.enum(["fail", "ask"]).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

const ServerConfigSchema = z
  .object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    token: SecretInputSchema.optional(),
  })
  .strict();

const StorageConfigSchema = z
  .object({
    sqlitePath: z.string().min(1).optional(),
  })
  .strict();

export const IclawConfigSchema = z
  .object({
    agents: z
      .record(z.string().min(1), AgentConfigSchema)
      .refine((agents) => Object.keys(agents).length > 0, {
        message: "At least one agent is required.",
      }),
    providers: ProvidersSchema,
    apis: z.record(z.string().min(1), ApiConfigSchema).optional(),
    webhooks: z.record(z.string().min(1), WebhookConfigSchema).optional(),
    schedules: z.record(z.string().min(1), ScheduleConfigSchema).optional(),
    server: ServerConfigSchema.optional(),
    storage: StorageConfigSchema.optional(),
  })
  .strict();

export function parseIclawConfig(value: unknown): IclawConfig {
  const parsed = IclawConfigSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid provider/config shape: ${details}`);
}
