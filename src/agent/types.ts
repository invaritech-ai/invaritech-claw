export type ProviderId = "openrouter" | "ollama";

export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ModelStreamInput = {
  model: string;
  messages: ModelMessage[];
  signal?: AbortSignal;
};

export type ModelCompleteInput = {
  model: string;
  messages: ModelMessage[];
  signal?: AbortSignal;
};

export type ModelCompleteResult = {
  text: string;
};

export type ModelStreamEvent = { type: "output_text_delta"; text: string } | { type: "done" };

export type ModelProvider = {
  id: "openrouter" | "ollama";
  complete(input: ModelCompleteInput): Promise<ModelCompleteResult>;
  stream(input: ModelStreamInput): AsyncIterable<ModelStreamEvent>;
  listModels?(): Promise<Array<{ id: string; name?: string }>>;
};
