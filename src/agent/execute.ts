import type { RunService } from "../runs/service.js";
import type { Run } from "../runs/types.js";
import { resolveProviderForModel, type ProviderRegistry } from "./model.js";
import type { ModelMessage } from "./types.js";

type MinimalRunService = Pick<
  RunService,
  "appendEvent" | "markRunning" | "markSucceeded" | "markFailed" | "markWaitingApproval" | "getRun"
>;

export type ExecuteRunInput = {
  runId: string;
  model: string;
  messages: ModelMessage[];
  providers: ProviderRegistry;
  runService: MinimalRunService;
  signal?: AbortSignal;
};

function toErrorPayload(error: unknown): { message: string } {
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}

function requireRun(runService: MinimalRunService, runId: string): Run {
  const run = runService.getRun(runId);
  if (!run) {
    throw new Error(`run not found: ${runId}`);
  }
  return run;
}

export async function executeRun(input: ExecuteRunInput): Promise<Run> {
  const { provider, model } = resolveProviderForModel(input.model, input.providers);
  input.runService.markRunning(input.runId);
  input.runService.appendEvent(input.runId, {
    type: "run.started",
    payload: { provider: provider.id, model },
  });

  let combinedOutput = "";

  try {
    for await (const event of provider.stream({
      model,
      messages: input.messages,
      signal: input.signal,
    })) {
      if (event.type === "output_text_delta") {
        combinedOutput += event.text;
        input.runService.appendEvent(input.runId, {
          type: "model.output.delta",
          payload: { text: event.text },
        });
        continue;
      }

      if (event.type === "tool_call") {
        input.runService.appendEvent(input.runId, {
          type: "tool.call",
          payload: {
            name: event.name,
            arguments: event.arguments ?? null,
            callId: event.callId ?? null,
          },
        });
        continue;
      }

      if (event.type === "approval_wait") {
        input.runService.markWaitingApproval(input.runId, event.approvalId);
        input.runService.appendEvent(input.runId, {
          type: "run.waiting_approval",
          payload: {
            approvalId: event.approvalId,
            reason: event.reason ?? null,
          },
        });
        return requireRun(input.runService, input.runId);
      }
    }

    input.runService.markSucceeded(input.runId, { outputText: combinedOutput });
    input.runService.appendEvent(input.runId, {
      type: "run.succeeded",
      payload: { outputText: combinedOutput },
    });
    return requireRun(input.runService, input.runId);
  } catch (error) {
    const payload = toErrorPayload(error);
    input.runService.markFailed(input.runId, payload);
    input.runService.appendEvent(input.runId, {
      type: "run.failed",
      payload,
    });
    return requireRun(input.runService, input.runId);
  }
}
