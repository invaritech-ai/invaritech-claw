import type { ModelProvider, ModelStreamEvent, ModelStreamInput } from "../../agent/types.js";

type OpenRouterProviderInput = {
  apiKey: string;
  fetchFn?: typeof fetch;
  baseUrl?: string;
};

const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
type ToolCallState = {
  name?: string;
  callId?: string;
  argumentsText: string;
  emitted: boolean;
};

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

function readToolCallDelta(choice: unknown, toolCallStates: Map<number, ToolCallState>): void {
  if (!choice || typeof choice !== "object") {
    return;
  }
  const delta = (choice as { delta?: unknown }).delta;
  if (!delta || typeof delta !== "object") {
    return;
  }
  const toolCalls = (delta as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(toolCalls)) {
    return;
  }

  for (const [toolCallArrayIndex, item] of toolCalls.entries()) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const indexValue = (item as { index?: unknown }).index;
    const toolCallIndex =
      typeof indexValue === "number" && Number.isInteger(indexValue)
        ? indexValue
        : toolCallArrayIndex;

    const existing = toolCallStates.get(toolCallIndex);
    const toolCallState: ToolCallState = existing ?? {
      argumentsText: "",
      emitted: false,
    };

    const callId = (item as { id?: unknown }).id;
    if (typeof callId === "string" && callId.trim().length > 0) {
      toolCallState.callId = callId;
    }

    const fn = (item as { function?: unknown }).function;
    if (!fn || typeof fn !== "object") {
      toolCallStates.set(toolCallIndex, toolCallState);
      continue;
    }
    const name = (fn as { name?: unknown }).name;
    if (typeof name === "string" && name.trim().length > 0) {
      toolCallState.name = name;
    }
    const argsFragment = (fn as { arguments?: unknown }).arguments;
    if (typeof argsFragment === "string") {
      toolCallState.argumentsText += argsFragment;
    }

    toolCallStates.set(toolCallIndex, toolCallState);
  }
}

function flushPendingToolCalls(toolCallStates: Map<number, ToolCallState>): ModelStreamEvent[] {
  const events: ModelStreamEvent[] = [];
  for (const toolCallState of toolCallStates.values()) {
    if (!toolCallState.name || toolCallState.emitted) {
      continue;
    }
    const argumentsValue = parseMaybeJson(toolCallState.argumentsText);
    events.push({
      type: "tool_call",
      name: toolCallState.name,
      arguments: argumentsValue,
      callId: toolCallState.callId,
    });
    toolCallState.emitted = true;
  }
  return events;
}

function readFinishReason(choice: unknown): string | null {
  if (!choice || typeof choice !== "object") {
    return null;
  }
  const finishReason = (choice as { finish_reason?: unknown }).finish_reason;
  return typeof finishReason === "string" ? finishReason : null;
}

function readErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const message = (value as { message?: unknown }).message;
  if (typeof message === "string" && message.trim().length > 0) {
    return message;
  }
  return null;
}

function findSseEventBoundary(buffer: string): { index: number; separatorLength: number } | null {
  const lfBoundary = buffer.indexOf("\n\n");
  const crlfBoundary = buffer.indexOf("\r\n\r\n");
  if (lfBoundary === -1 && crlfBoundary === -1) {
    return null;
  }
  if (lfBoundary === -1) {
    return { index: crlfBoundary, separatorLength: 4 };
  }
  if (crlfBoundary === -1) {
    return { index: lfBoundary, separatorLength: 2 };
  }
  if (crlfBoundary <= lfBoundary) {
    return { index: crlfBoundary, separatorLength: 4 };
  }
  return { index: lfBoundary, separatorLength: 2 };
}

function extractSseDataLines(rawEvent: string): string[] {
  const dataLines: string[] = [];
  for (const line of rawEvent.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) {
      continue;
    }
    let value = line.slice("data:".length);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }
    dataLines.push(value);
  }
  return dataLines;
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
      const boundary = findSseEventBoundary(buffer);
      if (!boundary) {
        break;
      }
      const rawEvent = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.separatorLength);
      const dataLines = extractSseDataLines(rawEvent);
      if (dataLines.length > 0) {
        yield dataLines.join("\n");
      }
    }
  }

  const trailing = buffer.trim();
  if (trailing.length > 0) {
    const dataLines = extractSseDataLines(trailing);
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
      const pendingToolCalls = new Map<number, ToolCallState>();
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
        if (data.trim() === "[DONE]") {
          break;
        }

        const parsed = JSON.parse(data) as { choices?: unknown; error?: unknown };
        const topLevelErrorMessage = readErrorMessage(parsed.error);
        if (topLevelErrorMessage) {
          throw new Error(`openrouter stream failed: ${topLevelErrorMessage}`);
        }
        const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
        for (const choice of choices) {
          if (readFinishReason(choice) === "error") {
            const choiceErrorMessage = readErrorMessage((choice as { error?: unknown }).error);
            throw new Error(
              choiceErrorMessage
                ? `openrouter stream failed: ${choiceErrorMessage}`
                : "openrouter stream failed: finish_reason=error",
            );
          }
          const textDelta = readTextDelta(choice);
          if (textDelta) {
            yield { type: "output_text_delta", text: textDelta };
          }
          readToolCallDelta(choice, pendingToolCalls);
          if (readFinishReason(choice) === "tool_calls") {
            for (const event of flushPendingToolCalls(pendingToolCalls)) {
              yield event;
            }
          }
        }
      }

      for (const event of flushPendingToolCalls(pendingToolCalls)) {
        yield event;
      }

      yield { type: "done" };
    },
  };
}
