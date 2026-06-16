import { resolveProviderForModel, type ProviderRegistry } from "../agent/model.js";
import type { IclawConfig } from "../config/types.js";
import type { MessageRecord, ThreadSummaryRecord } from "../storage/schema.js";
import { ThreadNotFoundError, type ThreadService } from "./service.js";

type PromptMessage = Pick<MessageRecord, "role" | "contentText">;

export type CompactThreadResult = {
  invocationId: string;
  summary: ThreadSummaryRecord;
};

export function buildCompactionPrompt(input: {
  objective: string | null;
  previousSummary: string | null;
  messages: PromptMessage[];
}): string {
  const transcript = input.messages
    .map((message) => `${message.role}: ${message.contentText}`)
    .join("\n\n");
  return [
    "Preserve objective, decisions, constraints, open questions, current status, and identifiers exactly.",
    `Objective:\n${input.objective ?? "none"}`,
    `Previous summary:\n${input.previousSummary ?? "none"}`,
    `Uncovered messages:\n${transcript || "none"}`,
  ].join("\n\n");
}

function keepRecentMessageCount(config: IclawConfig): number {
  const keepRecentMessages = config.compaction?.keepRecentMessages;
  if (!Number.isFinite(keepRecentMessages)) {
    return 12;
  }
  return Math.max(0, Math.floor(keepRecentMessages));
}

function selectMessagesToCompact(input: {
  messages: MessageRecord[];
  previousSummary: ThreadSummaryRecord | undefined;
  keepRecentMessages: number;
}): MessageRecord[] {
  const cutoff = Math.max(0, input.messages.length - input.keepRecentMessages);
  const coveredIndex = input.previousSummary?.coveredThroughMessageId
    ? input.messages.findIndex(
        (message) => message.id === input.previousSummary?.coveredThroughMessageId,
      )
    : -1;
  const start = coveredIndex >= 0 ? coveredIndex + 1 : 0;
  return input.messages.slice(start, cutoff);
}

export async function compactThread(input: {
  threadId: string;
  config: IclawConfig;
  providers: ProviderRegistry;
  service: ThreadService;
}): Promise<CompactThreadResult> {
  const thread = input.service.getThread(input.threadId);
  if (!thread) {
    throw new ThreadNotFoundError(input.threadId);
  }

  const modelRef = input.config.models.compaction || input.config.models.chat;
  const { provider, model } = resolveProviderForModel(modelRef, input.providers);
  const previousSummary = input.service.getLatestSummary(thread.id);
  const messages = input.service.listAllMessages(thread.id);
  const messagesToCompact = selectMessagesToCompact({
    messages,
    previousSummary,
    keepRecentMessages: keepRecentMessageCount(input.config),
  });
  const prompt = buildCompactionPrompt({
    objective: thread.objective,
    previousSummary: previousSummary?.summaryText ?? null,
    messages: messagesToCompact,
  });
  const invocation = input.service.recordInvocation({
    threadId: thread.id,
    modelRef,
    kind: "compaction",
  });

  try {
    const result = await provider.complete({
      model,
      messages: [
        {
          role: "system",
          content:
            "Summarize this iclaw thread for future context. Preserve objective, decisions, constraints, open questions, current status, and identifiers exactly.",
        },
        { role: "user", content: prompt },
      ],
    });
    const summary = input.service.storeSummary({
      threadId: thread.id,
      summaryText: result.text,
      coveredThroughMessageId:
        messagesToCompact.at(-1)?.id ?? previousSummary?.coveredThroughMessageId ?? null,
      sourceSummaryId: previousSummary?.id ?? null,
    });
    input.service.finishInvocation({
      invocationId: invocation.id,
      status: "succeeded",
      assistantMessageId: null,
    });
    return { summary, invocationId: invocation.id };
  } catch (error) {
    input.service.finishInvocation({
      invocationId: invocation.id,
      status: "failed",
      error: error instanceof Error ? { message: error.message } : { message: String(error) },
    });
    throw error;
  }
}
