import { describe, expect, it, vi } from "vitest";
import { createOpenRouterProvider } from "../../src/providers/openrouter/index.js";

type SseBodyOptions = {
  lineEnding?: "\n" | "\r\n";
  spaceAfterColon?: boolean;
};

function createSseBody(events: string[], options: SseBodyOptions = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lineEnding = options.lineEnding ?? "\n";
  const dataPrefix = options.spaceAfterColon === false ? "data:" : "data: ";
  const payload = events.map((event) => `${dataPrefix}${event}${lineEnding}${lineEnding}`).join("");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

describe("openrouter provider", () => {
  it("posts to OpenRouter chat completions with auth and streams deltas", async () => {
    const fetchFn = vi.fn(async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) => {
      const body = createSseBody([
        JSON.stringify({
          choices: [{ delta: { content: "Hello" } }],
        }),
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    id: "call_1",
                    function: {
                      name: "http.request",
                      arguments: JSON.stringify({ url: "https://example.com" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        "[DONE]",
      ]);

      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });

    const provider = createOpenRouterProvider({
      apiKey: "or-test-key",
      fetchFn,
    });

    const events: Array<{ type: string; [key: string]: unknown }> = [];
    for await (const event of provider.stream({
      model: "anthropic/claude-sonnet-4.6",
      messages: [{ role: "user", content: "hello" }],
    })) {
      events.push(event);
    }

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer or-test-key",
        "content-type": "application/json",
      },
    });

    expect(events).toEqual([
      { type: "output_text_delta", text: "Hello" },
      {
        type: "tool_call",
        name: "http.request",
        arguments: { url: "https://example.com" },
        callId: "call_1",
      },
      { type: "done" },
    ]);
  });

  it("handles CRLF framing and split tool call deltas", async () => {
    const fetchFn = vi.fn(async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) => {
      const body = createSseBody(
        [
          JSON.stringify({
            choices: [{ delta: { content: "Hello" } }],
          }),
          JSON.stringify({
            choices: [
              {
                finish_reason: null,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_1",
                      function: {
                        name: "http.request",
                        arguments: '{"url":"https://',
                      },
                    },
                  ],
                },
              },
            ],
          }),
          JSON.stringify({
            choices: [
              {
                finish_reason: "tool_calls",
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: {
                        arguments: 'example.com"}',
                      },
                    },
                  ],
                },
              },
            ],
          }),
          "[DONE]",
        ],
        { lineEnding: "\r\n", spaceAfterColon: false },
      );
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });

    const provider = createOpenRouterProvider({
      apiKey: "or-test-key",
      fetchFn,
    });

    const events: Array<{ type: string; [key: string]: unknown }> = [];
    for await (const event of provider.stream({
      model: "anthropic/claude-sonnet-4.6",
      messages: [{ role: "user", content: "hello" }],
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "output_text_delta", text: "Hello" },
      {
        type: "tool_call",
        name: "http.request",
        arguments: { url: "https://example.com" },
        callId: "call_1",
      },
      { type: "done" },
    ]);
  });

  it("throws when the stream returns an error chunk", async () => {
    const fetchFn = vi.fn(async () => {
      const body = createSseBody([
        JSON.stringify({
          choices: [{ delta: { content: "partial" } }],
        }),
        JSON.stringify({
          error: { message: "upstream overloaded" },
        }),
      ]);

      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });

    const provider = createOpenRouterProvider({
      apiKey: "or-test-key",
      fetchFn,
    });

    await expect(async () => {
      for await (const _event of provider.stream({
        model: "anthropic/claude-sonnet-4.6",
        messages: [{ role: "user", content: "hello" }],
      })) {
        // consume
      }
    }).rejects.toThrow("openrouter stream failed: upstream overloaded");
  });
});
