import type { ModelProvider, ModelStreamEvent, ModelStreamInput } from "../../agent/types.js";

type OpenRouterProviderInput = {
  apiKey: string;
  fetchFn?: typeof fetch;
  baseUrl?: string;
};

const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

function parseMaybeJson(value: string | undefined): unknown {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function readToolCallDelta(choice: unknown): ModelStreamEvent[] {
  if (!choice || typeof choice !== "object") {
    return [];
  }
  const delta = (choice as { delta?: unknown }).delta;
  if (!delta || typeof delta !== "object") {
    return [];
  }
  const toolCalls = (delta as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(toolCalls)) {
    return [];
  }

  const events: ModelStreamEvent[] = [];
  for (const item of toolCalls) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const fn = (item as { function?: unknown }).function;
    if (!fn || typeof fn !== "object") {
      continue;
    }
    const name = (fn as { name?: unknown }).name;
    if (typeof name !== "string" || name.trim().length === 0) {
      continue;
    }
    const args = parseMaybeJson((fn as { arguments?: unknown }).arguments as string | undefined);
    const callId = (item as { id?: unknown }).id;
    events.push({
      type: "tool_call",
      name,
      arguments: args,
      callId: typeof callId === "string" && callId.trim().length > 0 ? callId : undefined,
    });
  }
  return events;
}

function readTextDelta(choice: unknown): string | null {
  if (!choice || typeof choice !== "object") {
    return null;
  }
  const delta = (choice as { delta?: unknown }).delta;
  if (!delta || typeof delta !== "object") {
    return null;
  }
  const content = (delta as { content?: unknown }).content;
  return typeof content === "string" && content.length > 0 ? content : null;
}

async function* iterateSseData(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
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
      const boundary = buffer.indexOf("\n\n");
      if (boundary === -1) {
        break;
      }
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const dataLines = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length));
      if (dataLines.length > 0) {
        yield dataLines.join("\n");
      }
    }
  }

  const trailing = buffer.trim();
  if (trailing.length > 0) {
    const dataLines = trailing
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice("data: ".length));
    if (dataLines.length > 0) {
      yield dataLines.join("\n");
    }
  }
}

export function createOpenRouterProvider(input: OpenRouterProviderInput): ModelProvider {
  const fetchFn = input.fetchFn ?? fetch;
  const baseUrl = (input.baseUrl ?? OPENROUTER_DEFAULT_BASE_URL).replace(/\/+$/, "");

  return {
    id: "openrouter",
    async *stream(streamInput: ModelStreamInput): AsyncIterable<ModelStreamEvent> {
      const response = await fetchFn(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify({
          model: streamInput.model,
          messages: streamInput.messages,
          stream: true,
        }),
        signal: streamInput.signal,
      });

      if (!response.ok) {
        throw new Error(`openrouter stream failed: ${response.status}`);
      }
      if (!response.body) {
        throw new Error("openrouter stream failed: missing response body");
      }

      for await (const data of iterateSseData(response.body)) {
        if (data === "[DONE]") {
          break;
        }

        const parsed = JSON.parse(data) as { choices?: unknown };
        const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
        for (const choice of choices) {
          const textDelta = readTextDelta(choice);
          if (textDelta) {
            yield { type: "output_text_delta", text: textDelta };
          }
          for (const event of readToolCallDelta(choice)) {
            yield event;
          }
        }
      }

      yield { type: "done" };
    },
  };
}
