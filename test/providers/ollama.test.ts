import { describe, expect, it, vi } from "vitest";
import { createOllamaProvider } from "../../src/providers/ollama/index.js";

function createNdjsonBody(rows: Array<Record<string, unknown>>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = rows.map((row) => `${JSON.stringify(row)}\n`).join("");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

describe("ollama provider", () => {
  it("posts to /api/chat and streams model deltas", async () => {
    const fetchFn = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      void init;
      if (String(url).endsWith("/api/chat")) {
        const body = createNdjsonBody([
          { message: { content: "Hi" }, done: false },
          {
            message: {
              content: "",
              tool_calls: [
                {
                  function: {
                    name: "state.set",
                    arguments: JSON.stringify({ key: "x", value: "1" }),
                  },
                },
              ],
            },
            done: false,
          },
          { done: true },
        ]);
        return new Response(body, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const provider = createOllamaProvider({
      baseUrl: "http://127.0.0.1:11434",
      fetchFn,
    });

    const events: Array<{ type: string; [key: string]: unknown }> = [];
    for await (const event of provider.stream({
      model: "llama3.2",
      messages: [{ role: "user", content: "hello" }],
    })) {
      events.push(event);
    }

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    });

    expect(events).toEqual([
      { type: "output_text_delta", text: "Hi" },
      {
        type: "tool_call",
        name: "state.set",
        arguments: { key: "x", value: "1" },
      },
      { type: "done" },
    ]);
  });

  it("lists models from /api/tags", async () => {
    const fetchFn = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      void init;
      if (String(url).endsWith("/api/tags")) {
        return new Response(
          JSON.stringify({
            models: [
              { name: "llama3.2", model: "llama3.2" },
              { name: "qwen3", model: "qwen3" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const provider = createOllamaProvider({
      baseUrl: "http://localhost:11434",
      fetchFn,
    });

    const models = await provider.listModels?.();
    expect(models).toEqual([
      { id: "llama3.2", name: "llama3.2" },
      { id: "qwen3", name: "qwen3" },
    ]);
    expect(fetchFn).toHaveBeenCalledWith("http://localhost:11434/api/tags", { method: "GET" });
  });
});
