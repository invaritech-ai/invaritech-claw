import type {
  ModelCompleteInput,
  ModelCompleteResult,
  ModelProvider,
  ModelStreamEvent,
  ModelStreamInput,
} from "../../agent/types.js";

type OllamaProviderInput = {
  baseUrl: string;
  fetchFn?: typeof fetch;
};

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (trimmed.length === 0) {
    throw new Error("ollama baseUrl is required");
  }
  return trimmed.replace(/\/+$/, "");
}

async function* iterateJsonLines(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        yield line;
      }
    }
  }

  const trailing = buffer.trim();
  if (trailing.length > 0) {
    yield trailing;
  }
}

function readTextDelta(chunk: unknown): string | null {
  if (!chunk || typeof chunk !== "object") {
    return null;
  }
  const message = (chunk as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return null;
  }
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" && content.length > 0 ? content : null;
}

function readErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return null;
}

function readCompleteContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const message = (payload as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return null;
  }
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

export function createOllamaProvider(input: OllamaProviderInput): ModelProvider {
  const fetchFn = input.fetchFn ?? fetch;
  const baseUrl = normalizeBaseUrl(input.baseUrl);

  return {
    id: "ollama",
    async complete(completeInput: ModelCompleteInput): Promise<ModelCompleteResult> {
      const response = await fetchFn(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: completeInput.model,
          messages: completeInput.messages,
          stream: false,
        }),
        signal: completeInput.signal,
      });

      if (!response.ok) {
        throw new Error(`ollama complete failed: ${response.status}`);
      }
      if (!response.body) {
        throw new Error("ollama complete failed: missing response body");
      }

      const payload = (await response.json()) as unknown;
      const errorMessage = readErrorMessage(payload);
      if (errorMessage) {
        throw new Error(`ollama complete failed: ${errorMessage}`);
      }
      const content = readCompleteContent(payload);
      if (content === null) {
        throw new Error("ollama complete failed: missing message content");
      }
      return { text: content };
    },

    async *stream(streamInput: ModelStreamInput): AsyncIterable<ModelStreamEvent> {
      const response = await fetchFn(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: streamInput.model,
          messages: streamInput.messages,
          stream: true,
        }),
        signal: streamInput.signal,
      });

      if (!response.ok) {
        throw new Error(`ollama stream failed: ${response.status}`);
      }
      if (!response.body) {
        throw new Error("ollama stream failed: missing response body");
      }

      for await (const line of iterateJsonLines(response.body)) {
        const chunk = JSON.parse(line) as unknown;
        const textDelta = readTextDelta(chunk);
        if (textDelta) {
          yield { type: "output_text_delta", text: textDelta };
        }
      }

      yield { type: "done" };
    },

    async listModels(): Promise<Array<{ id: string; name?: string }>> {
      const response = await fetchFn(`${baseUrl}/api/tags`, {
        method: "GET",
      });
      if (!response.ok) {
        throw new Error(`ollama model list failed: ${response.status}`);
      }
      const payload = (await response.json()) as {
        models?: Array<{ name?: unknown; model?: unknown }>;
      };
      const models = Array.isArray(payload.models) ? payload.models : [];
      return models
        .map((entry) => {
          const idCandidate =
            typeof entry.model === "string"
              ? entry.model
              : typeof entry.name === "string"
                ? entry.name
                : null;
          if (!idCandidate) {
            return null;
          }
          const name = typeof entry.name === "string" ? entry.name : undefined;
          return name ? { id: idCandidate, name } : { id: idCandidate };
        })
        .filter((entry): entry is { id: string; name?: string } => entry !== null);
    },
  };
}
