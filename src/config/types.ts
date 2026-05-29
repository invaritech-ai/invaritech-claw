export type SecretRef = { env: string } | { value: string };

export type AgentConfig = {
  model: string;
  system?: string;
  tools: string[];
};

export type OpenRouterProviderConfig = {
  apiKey: SecretRef;
  baseUrl?: string;
};

export type OllamaProviderConfig = {
  baseUrl?: string;
};

export type ProviderConfig = {
  openrouter?: OpenRouterProviderConfig;
  ollama?: OllamaProviderConfig;
};

export type ServerConfig = {
  host: string;
  port: number;
};

export type StorageConfig = {
  sqlitePath?: string;
};

export type IclawConfig = {
  agents: Record<string, AgentConfig>;
  providers: ProviderConfig;
  server: ServerConfig;
  storage: StorageConfig;
};
