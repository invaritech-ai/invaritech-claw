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

    expect(events).toEqual([{ type: "output_text_delta", text: "Hello" }, { type: "done" }]);
  });

  it("openrouter complete posts non-streaming chat and returns choice message content", async () => {
    const fetchFn = vi.fn(async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        model: "anthropic/claude-sonnet-4.6",
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Hello back" } }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const provider = createOpenRouterProvider({
      apiKey: "or-test-key",
      fetchFn,
    });

    await expect(
      provider.complete({
        model: "anthropic/claude-sonnet-4.6",
        messages: [{ role: "user", content: "hello" }],
      }),
    ).resolves.toEqual({ text: "Hello back" });

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
  });

  it("openrouter complete fails clearly for provider errors and missing content", async () => {
    const providerError = createOpenRouterProvider({
      apiKey: "or-test-key",
      fetchFn: vi.fn(async () => {
        return new Response(JSON.stringify({ error: { message: "upstream overloaded" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    });

    await expect(
      providerError.complete({
        model: "anthropic/claude-sonnet-4.6",
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow("openrouter complete failed: upstream overloaded");

    const missingContent = createOpenRouterProvider({
      apiKey: "or-test-key",
      fetchFn: vi.fn(async () => {
        return new Response(JSON.stringify({ choices: [{ message: {} }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    });

    await expect(
      missingContent.complete({
        model: "anthropic/claude-sonnet-4.6",
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow("openrouter complete failed: missing choice message content");
  });

  it("openrouter complete fails clearly for non-2xx and missing response body", async () => {
    const nonOk = createOpenRouterProvider({
      apiKey: "or-test-key",
      fetchFn: vi.fn(async () => new Response("unavailable", { status: 503 })),
    });

    await expect(
      nonOk.complete({
        model: "anthropic/claude-sonnet-4.6",
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow("openrouter complete failed: 503");

    const missingBody = createOpenRouterProvider({
      apiKey: "or-test-key",
      fetchFn: vi.fn(async () => new Response(null, { status: 200 })),
    });

    await expect(
      missingBody.complete({
        model: "anthropic/claude-sonnet-4.6",
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow("openrouter complete failed: missing response body");
  });

  it("handles CRLF framing", async () => {
    const fetchFn = vi.fn(async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) => {
      const body = createSseBody(
        [
          JSON.stringify({
            choices: [{ delta: { content: "Hello" } }],
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

    expect(events).toEqual([{ type: "output_text_delta", text: "Hello" }, { type: "done" }]);
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
