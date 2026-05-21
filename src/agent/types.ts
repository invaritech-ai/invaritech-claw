export type ProviderId = "openrouter" | "ollama";

export type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type ModelStreamInput = {
  model: string;
  messages: ModelMessage[];
  signal?: AbortSignal;
};

export type ModelStreamEvent =
  | { type: "output_text_delta"; text: string }
  | { type: "tool_call"; name: string; arguments?: unknown; callId?: string }
  | { type: "approval_wait"; approvalId: string; reason?: string }
  | { type: "done" };

export type ModelProvider = {
  id: "openrouter" | "ollama";
  stream(input: ModelStreamInput): AsyncIterable<ModelStreamEvent>;
  listModels?(): Promise<Array<{ id: string; name?: string }>>;
};
