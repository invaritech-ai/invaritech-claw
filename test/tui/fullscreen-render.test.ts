import { describe, expect, it } from "vitest";
import type { Thread, ThreadMessage } from "../../src/threads/types.js";
import {
  buildFullscreenRenderSnapshot,
  createFullscreenTuiState,
} from "../../src/tui/fullscreen/state.js";
import {
  buildFullscreenRenderableMessages,
  formatFullscreenFooter,
  formatFullscreenHeader,
} from "../../src/tui/fullscreen/view.js";

function sampleThread(input: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    title: "Main thread",
    objective: null,
    activeModelRef: "ollama/test",
    createdAtMs: 1,
    updatedAtMs: 2,
    archivedAtMs: null,
    ...input,
  };
}

function sampleMessage(input: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    role: "assistant",
    contentText: "assistant reply",
    modelRef: "ollama/test",
    status: "complete",
    createdAtMs: 3,
    ...input,
  };
}

describe("fullscreen TUI render snapshot", () => {
  it("includes top bar, chat, composer, right rail, panel, and footer command hints", () => {
    const state = createFullscreenTuiState({
      agentId: "main",
      serverUrl: "http://127.0.0.1:47823",
      activeThread: sampleThread(),
      messages: [
        sampleMessage({ role: "user", contentText: "hello", modelRef: null }),
        sampleMessage({ role: "assistant", contentText: "ollama/test thinking..." }),
      ],
    });
    const snapshot = buildFullscreenRenderSnapshot({
      ...state,
      panel: {
        kind: "help",
        title: "Help",
        body: "commands:\n/help\n/thread list\n/model list",
      },
    });

    expect(snapshot.join("\n")).toContain(
      "iclaw | thread Main thread | model ollama/test | server http://127.0.0.1:47823 | provider ollama",
    );
    expect(snapshot.join("\n")).toContain("user: hello");
    expect(snapshot.join("\n")).toContain("assistant: ollama/test thinking...");
    expect(snapshot.join("\n")).toContain("compose:");
    expect(snapshot.join("\n")).toContain("context:");
    expect(snapshot.join("\n")).toContain("memory:");
    expect(snapshot.join("\n")).toContain("Help");
    expect(snapshot.join("\n")).toContain(
      "/help /thread list /model list /memory /context /compact /exit",
    );
  });

  it("formats restored terminal header, footer, messages, and panels", () => {
    const state = createFullscreenTuiState({
      agentId: "main",
      serverUrl: "http://127.0.0.1:47823",
      activeThread: sampleThread(),
      messages: [
        sampleMessage({ id: "user-1", role: "user", contentText: "hello", modelRef: null }),
        sampleMessage({
          id: "assistant-1",
          role: "assistant",
          contentText: "assistant reply",
        }),
      ],
    });

    const withPanel = {
      ...state,
      panel: {
        kind: "context" as const,
        title: "Context",
        body: "tokens: 123\nrecent: 2",
      },
    };

    expect(formatFullscreenHeader(withPanel)).toBe(
      "iclaw tui - http://127.0.0.1:47823 - thread Main thread - model ollama/test",
    );
    expect(formatFullscreenFooter(withPanel)).toContain("context --%");
    expect(formatFullscreenFooter(withPanel)).toContain("activity idle");
    expect(buildFullscreenRenderableMessages(withPanel)).toEqual([
      { kind: "user", text: "hello" },
      { kind: "assistant", text: "assistant reply" },
      { kind: "system", text: "Context\n\ntokens: 123\nrecent: 2" },
    ]);
  });
});
