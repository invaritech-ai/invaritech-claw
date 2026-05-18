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
