// Split into focused modules to keep files small and improve edit locality.

export * from "./types.agent-defaults.js";
export * from "./types.agents.js";
export * from "./types.acp.js";
export * from "./types.approvals.js";
export * from "./types.auth.js";
export * from "./types.base.js";
export * from "./types.browser.js";
export * from "./types.channels.js";
export * from "./types.cli.js";
export * from "./types.openclaw.js";
export * from "./types.cron.js";
export * from "./types.discord.js";
export * from "./types.googlechat.js";
export * from "./types.gateway.js";
export * from "./types.hooks.js";
export * from "./types.imessage.js";
export * from "./types.irc.js";
export * from "./types.messages.js";
export * from "./types.models.js";
export * from "./types.node-host.js";
export * from "./types.msteams.js";
export * from "./types.plugins.js";
export * from "./types.provider-request.js";
export * from "./types.queue.js";
export * from "./types.sandbox.js";
export * from "./types.secrets.js";
export * from "./types.signal.js";
export * from "./types.skills.js";
export * from "./types.slack.js";
export * from "./types.telegram.js";
export * from "./types.tts.js";
export * from "./types.tools.js";
export * from "./types.whatsapp.js";
export * from "./types.memory.js";
export * from "./types.mcp.js";

export type SecretRef = {
  env: string;
};

export type FileSecretRef = {
  file: string;
};

export type SecretInput = SecretRef | FileSecretRef;

export type IclawAgentConfig = {
  model: string;
  system?: string;
  tools: string[];
};

export type OpenRouterProviderConfig = {
  apiKey: SecretInput;
};

export type OllamaProviderConfig = {
  baseUrl: string;
};

export type IclawProvidersConfig = {
  openrouter: OpenRouterProviderConfig;
  ollama: OllamaProviderConfig;
};

export type ApiAllowRule = {
  method: string;
  path: string;
};

export type ApiAuthConfig = {
  bearer?: SecretInput;
};

export type ApiConfig = {
  baseUrl: string;
  auth?: ApiAuthConfig;
  allow?: ApiAllowRule[];
};

export type WebhookConfig = {
  path: string;
  agentId: string;
  secret?: SecretInput;
  idempotency?: {
    header: string;
  };
  approvalMode?: "fail" | "ask";
};

export type ScheduleConfig = {
  agentId: string;
  schedule: {
    cron: string;
    timezone?: string;
  };
  input?: Record<string, unknown>;
  approvalMode?: "fail" | "ask";
  enabled?: boolean;
};

export type ServerConfig = {
  host: string;
  port: number;
  token?: SecretInput;
};

export type StorageConfig = {
  sqlitePath?: string;
};

export type IclawConfig = {
  agents: Record<string, IclawAgentConfig>;
  providers: IclawProvidersConfig;
  apis?: Record<string, ApiConfig>;
  webhooks?: Record<string, WebhookConfig>;
  schedules?: Record<string, ScheduleConfig>;
  server?: ServerConfig;
  storage?: StorageConfig;
};
