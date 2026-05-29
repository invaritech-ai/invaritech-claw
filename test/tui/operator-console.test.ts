import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { Run } from "../../src/runs/types.js";
import { runInteractiveOperatorConsole } from "../../src/tui/interactive.js";
import {
  createNativeOperatorApiClient,
  type NativeOperatorApiClient,
  type OperatorStatus,
} from "../../src/tui/operator-api.js";
import {
  runOperatorCommand,
  runOperatorPrompt,
  buildOperatorActiveView,
  createOperatorConsoleState,
  refreshOperatorView,
  switchOperatorView,
} from "../../src/tui/operator-console.js";

function sampleRun(input: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    agentId: "main",
    triggerType: "api",
    triggerId: null,
    status: "queued",
    input: {},
    result: null,
    error: null,
    idempotencyKey: null,
    createdAtMs: 1,
    startedAtMs: null,
    finishedAtMs: null,
    ...input,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function collectOutput(): { output: Writable; read(): string } {
  let text = "";
  return {
    output: new Writable({
      write(chunk, _encoding, callback) {
        text += String(chunk);
        callback();
      },
    }),
    read() {
      return text;
    },
  };
}

describe("operator console state", () => {
  it("switches between chat, runs, and status views", () => {
    let state = createOperatorConsoleState({ selectedAgentId: "main" });

    for (const view of ["chat", "runs", "status"] as const) {
      state = switchOperatorView(state, view);
      expect(state.activeView).toBe(view);
      expect(buildOperatorActiveView(state).title.toLowerCase()).toBe(view);
    }
  });

  it("refreshes native operator views through the API client", async () => {
    const runs = [sampleRun()];
    const status: OperatorStatus = { ok: true, databasePath: "/tmp/iclaw.sqlite" };
    const client: NativeOperatorApiClient = {
      createRun: vi.fn(async () => runs[0]!),
      listRuns: vi.fn(async () => runs),
      getRun: vi.fn(async () => runs[0]!),
      cancelRun: vi.fn(async () => runs[0]!),
      getStatus: vi.fn(async () => status),
    };

    let state = createOperatorConsoleState({ selectedAgentId: "main" });
    state = await refreshOperatorView(switchOperatorView(state, "runs"), client, 100);
    expect(state.runs).toEqual(runs);
    expect(client.listRuns).toHaveBeenCalledWith({ agentId: "main" });

    state = await refreshOperatorView(switchOperatorView(state, "status"), client, 103);
    expect(state.status).toEqual(status);
    expect(client.getStatus).toHaveBeenCalled();
  });

  it("sends prompt input as an executable tui run", async () => {
    const createRun = vi.fn(async () =>
      sampleRun({
        status: "succeeded",
        result: { outputText: "assistant reply" },
      }),
    );
    const client = { createRun } as Partial<NativeOperatorApiClient> as NativeOperatorApiClient;

    const output = await runOperatorPrompt({
      agentId: "main",
      client,
      prompt: "hello",
    });

    expect(createRun).toHaveBeenCalledWith({
      agentId: "main",
      triggerType: "tui",
      input: { text: "hello" },
      execute: true,
    });
    expect(output).toBe("assistant reply");
  });

  it("handles status, runs, and exit operator commands", async () => {
    const runs = [sampleRun()];
    const client = {
      getStatus: vi.fn(async () => ({ ok: true })),
      listRuns: vi.fn(async () => runs),
    } as Partial<NativeOperatorApiClient> as NativeOperatorApiClient;

    await expect(
      runOperatorCommand({ command: "/status", agentId: "main", client }),
    ).resolves.toContain('"ok": true');
    await expect(
      runOperatorCommand({ command: "/runs", agentId: "main", client }),
    ).resolves.toContain("run-1");
    await expect(runOperatorCommand({ command: "/exit", agentId: "main", client })).resolves.toBe(
      null,
    );
  });

  it("runs the line-based interactive loop", async () => {
    const output = collectOutput();
    const client = {
      createRun: vi.fn(async () =>
        sampleRun({
          status: "succeeded",
          result: { outputText: "assistant reply" },
        }),
      ),
      getStatus: vi.fn(async () => ({ ok: true })),
      listRuns: vi.fn(async () => [sampleRun()]),
    } as Partial<NativeOperatorApiClient> as NativeOperatorApiClient;

    await runInteractiveOperatorConsole({
      agentId: "main",
      client,
      input: Readable.from(["hello\n/status\n/runs\n/exit\n"]),
      output: output.output,
    });

    expect(output.read()).toContain("assistant reply");
    expect(output.read()).toContain('"ok": true');
    expect(output.read()).toContain("run-1");
  });
});

describe("native operator API client", () => {
  it("calls run and status endpoints", async () => {
    const calls: Array<{ url: URL; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      calls.push({ url, init });
      switch (url.pathname) {
        case "/runs":
          return jsonResponse({ runs: [sampleRun()] });
        case "/health":
          return jsonResponse({ ok: true });
        default:
          return jsonResponse({ error: "not found" }, 404);
      }
    });
    const client = createNativeOperatorApiClient({
      baseUrl: "http://127.0.0.1:48123",
      fetchImpl,
    });

    await client.listRuns({ agentId: "main", limit: 5 });
    await client.createRun({
      agentId: "main",
      triggerType: "tui",
      input: { text: "hello" },
      execute: true,
    });
    await client.getStatus();

    expect(calls.map((call) => `${call.init?.method ?? "GET"} ${call.url.pathname}`)).toEqual([
      "GET /runs",
      "POST /runs",
      "GET /health",
    ]);
    expect(calls[0]?.url.searchParams.get("agentId")).toBe("main");
    expect(calls[0]?.url.searchParams.get("limit")).toBe("5");
  });
});
