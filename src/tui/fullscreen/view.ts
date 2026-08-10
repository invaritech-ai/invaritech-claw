import type { ThreadMessage } from "../../threads/types.js";
import type { ChatLog } from "../components/chat-log.js";
import type { FullscreenTuiState } from "./state.js";

export type FullscreenRenderableMessage = {
  kind: "assistant" | "user" | "system";
  text: string;
};

function providerFromModel(modelRef: string): string {
  return modelRef.split("/", 1)[0] || "unknown";
}

function roleKind(role: ThreadMessage["role"]): FullscreenRenderableMessage["kind"] {
  return role === "user" ? "user" : "assistant";
}

export function formatFullscreenHeader(state: FullscreenTuiState): string {
  const threadLabel = state.activeThread?.title ?? "none";
  const modelRef = state.activeThread?.activeModelRef ?? "none";
  return `iclaw tui - ${state.serverUrl} - thread ${threadLabel} - model ${modelRef}`;
}

export function formatFullscreenFooter(state: FullscreenTuiState): string {
  const context =
    state.rightRail.contextPercent === null ? "--" : String(state.rightRail.contextPercent);
  return [
    `agent ${state.agentId}`,
    `provider ${state.activeThread ? providerFromModel(state.activeThread.activeModelRef) : "none"}`,
    `context ${context}%`,
    `summary ${state.rightRail.summaryState}`,
    `recent ${state.rightRail.recentMessageCount}`,
    `memory ${state.rightRail.memoryCount}`,
    `activity ${state.rightRail.currentActivity}`,
  ].join(" | ");
}

export function formatFullscreenStatus(state: FullscreenTuiState): string {
  if (state.pendingOperation) {
    return `${state.pendingOperation}: ${state.rightRail.currentActivity}`;
  }
  if (state.lastError) {
    return `error: ${state.lastError}`;
  }
  return state.rightRail.currentActivity === "idle" ? "ready" : state.rightRail.currentActivity;
}

export function buildFullscreenRenderableMessages(
  state: FullscreenTuiState,
): FullscreenRenderableMessage[] {
  const messages: FullscreenRenderableMessage[] = state.messages.slice(-80).map((message) => ({
    kind: roleKind(message.role),
    text: message.contentText,
  }));
  const panel = state.detail ?? state.panel;
  if (panel) {
    messages.push({ kind: "system", text: `${panel.title}\n\n${panel.body}` });
  }
  if (state.lastError && panel?.kind !== "error") {
    messages.push({ kind: "system", text: `error: ${state.lastError}` });
  }
  return messages;
}

export function syncFullscreenChatLog(chatLog: ChatLog, state: FullscreenTuiState): void {
  chatLog.clearAll();
  const messages = buildFullscreenRenderableMessages(state);
  if (messages.length === 0) {
    chatLog.addSystem("No messages yet.");
    return;
  }
  for (const message of messages) {
    switch (message.kind) {
      case "user":
        chatLog.addUser(message.text);
        break;
      case "assistant":
        chatLog.addAssistant(message.text);
        break;
      case "system":
        chatLog.addSystem(message.text);
        break;
    }
  }
}
