import type { ModelMessage } from "../agent/types.js";
import type { IclawConfig } from "../config/types.js";
import type { ThreadService } from "./service.js";
import type { ThreadMemory, ThreadMessage } from "./types.js";

export type BuiltThreadContext = {
  messages: ModelMessage[];
  usedMemories: ThreadMemory[];
  sections: {
    objective: string;
    memories: string;
    summary: string | null;
    recentMessageCount: number;
  };
  tokenEstimate: number;
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function budgetTokens(maxTokens: number, percent: number): number {
  return Math.max(0, Math.floor((maxTokens * percent) / 100));
}

function messageLabel(message: ThreadMessage): string {
  return `${message.role}: ${message.contentText}`;
}

function takeNewestWithinBudget(messages: ThreadMessage[], budget: number): ThreadMessage[] {
  const selected: ThreadMessage[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    const cost = estimateTokens(messageLabel(message));
    if (selected.length > 0 && used + cost > budget) {
      break;
    }
    if (selected.length === 0 || used + cost <= budget) {
      selected.push(message);
      used += cost;
    }
  }
  return selected.toReversed();
}

function formatMemories(
  memories: ThreadMemory[],
  budget: number,
): { text: string; used: ThreadMemory[] } {
  const lines: string[] = [];
  const used: ThreadMemory[] = [];
  let tokens = 0;
  for (const memory of memories) {
    const line = `- ${memory.type} ${memory.scope}: ${memory.contentText}`;
    const cost = estimateTokens(line);
    if (used.length > 0 && tokens + cost > budget) {
      break;
    }
    if (used.length === 0 || tokens + cost <= budget) {
      lines.push(line);
      used.push(memory);
      tokens += cost;
    }
  }
  return {
    text: lines.length > 0 ? lines.join("\n") : "none",
    used,
  };
}

export function buildThreadContext(input: {
  service: ThreadService;
  threadId: string;
  currentUserMessageId: string;
  config: IclawConfig;
}): BuiltThreadContext {
  const thread = input.service.getThread(input.threadId);
  if (!thread) {
    throw new Error(`thread not found: ${input.threadId}`);
  }
  const messages = input.service.listMessages(input.threadId, 1000);
  const current = messages.find((message) => message.id === input.currentUserMessageId);
  if (!current) {
    throw new Error(`message not found: ${input.currentUserMessageId}`);
  }

  const maxTokens =
    input.config.models.contextWindows[thread.activeModelRef] ?? input.config.context.maxTokens;
  const responseReserve = budgetTokens(maxTokens, input.config.context.responseReservePercent);
  const promptBudget = Math.max(1, maxTokens - responseReserve);
  const memoryBudget = budgetTokens(promptBudget, input.config.context.memoryPercent);
  const summaryBudget = budgetTokens(promptBudget, input.config.context.summaryPercent);
  const recentBudget = budgetTokens(promptBudget, input.config.context.recentMessagesPercent);

  const query = [thread.objective, current.contentText].filter(Boolean).join(" ");
  const memories = input.service.searchMemories({
    query,
    scope: "thread_and_global",
    threadId: input.threadId,
    limit: 8,
  });
  const formattedMemories = formatMemories(memories, memoryBudget);

  const summary = input.service.getLatestSummary(input.threadId);
  const summaryText =
    summary && estimateTokens(summary.summaryText) <= summaryBudget ? summary.summaryText : null;
  const previousMessages = messages.filter((message) => message.id !== current.id);
  const recentMessages = takeNewestWithinBudget(previousMessages, recentBudget);

  const objective = thread.objective?.trim() || "Not set.";
  const systemParts = [
    "System instructions: You are iclaw, a local thread-first assistant. Use context carefully.",
    `Current objective: ${objective}`,
    `Relevant memories:\n${formattedMemories.text}`,
    `Thread summary:\n${summaryText ?? "none"}`,
    `Recent messages:\n${
      recentMessages.length > 0 ? recentMessages.map(messageLabel).join("\n") : "none"
    }`,
  ];
  const systemContent = systemParts.join("\n\n");
  const modelMessages: ModelMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: current.contentText },
  ];

  return {
    messages: modelMessages,
    usedMemories: formattedMemories.used,
    sections: {
      objective,
      memories: formattedMemories.text,
      summary: summaryText,
      recentMessageCount: recentMessages.length,
    },
    tokenEstimate: modelMessages.reduce((sum, message) => sum + estimateTokens(message.content), 0),
  };
}
