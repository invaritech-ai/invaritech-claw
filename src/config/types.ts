export type SecretRef = { env: string } | { value: string };

export type AgentConfig = {
  model: string;
  system?: string;
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
  apiToken?: SecretRef;
  host: string;
  port: number;
};

export type StorageConfig = {
  sqlitePath?: string;
};

export type ModelDefaultsConfig = {
  chat: string;
  memory: string;
  compaction: string;
  embedding: string;
  favorites: string[];
  contextWindows: Record<string, number>;
};

export type ContextConfig = {
  maxTokens: number;
  responseReservePercent: number;
  memoryPercent: number;
  summaryPercent: number;
  recentMessagesPercent: number;
};

export type CompactionConfig = {
  keepRecentMessages: number;
};

export type MemoryConfig = {
  curatorPromptPath?: string;
  compactionPromptPath?: string;
};

export type WorkersConfig = {
  enabled: boolean;
  pollIntervalMs: number;
};

export type IclawConfig = {
  agents: Record<string, AgentConfig>;
  compaction: CompactionConfig;
  context: ContextConfig;
  memory: MemoryConfig;
  models: ModelDefaultsConfig;
  providers: ProviderConfig;
  server: ServerConfig;
  storage: StorageConfig;
  workers: WorkersConfig;
};
