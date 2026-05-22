import type { DatabaseSync } from "node:sqlite";
import type { ApprovalService } from "../approvals/service.js";
import type { RunService } from "../runs/service.js";
import {
  executeHttpRequestTool,
  type HttpRequestInput,
  type HttpRequestPolicy,
} from "./http-request.js";
import { createRunTools } from "./runs.js";
import { createScheduleTools } from "./schedules.js";
import { createStateTools } from "./state.js";

export type ToolRegistry = ReturnType<typeof createToolRegistry>;

type ToolInvocation = {
  runId: string;
  name: string;
  input: unknown;
  requireApproval?: boolean;
};

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error(message);
  }
}

export function createToolRegistry(input: {
  db: DatabaseSync;
  runService: RunService;
  approvalService: ApprovalService;
  httpPolicy: HttpRequestPolicy;
  fetchFn?: typeof fetch;
}) {
  const stateTools = createStateTools(input.db);
  const runTools = createRunTools(input.runService);
  const scheduleTools = createScheduleTools(input.db);

  return {
    async invoke(call: ToolInvocation): Promise<unknown> {
      if (call.requireApproval) {
        const approval = input.approvalService.createPendingApproval({
          runId: call.runId,
          request: {
            tool: call.name,
            input: call.input,
          },
        });
        input.runService.markWaitingApproval(call.runId, approval.id);
        return {
          status: "waiting_approval",
          approvalId: approval.id,
        };
      }

      switch (call.name) {
        case "http.request":
          return await executeHttpRequestTool(
            call.input as HttpRequestInput,
            input.httpPolicy,
            input.fetchFn,
          );
        case "state.set": {
          assertRecord(call.input, "state.set input must be an object");
          const namespace = String(call.input.namespace ?? "");
          const key = String(call.input.key ?? "");
          stateTools.set(namespace, key, call.input.value);
          return { ok: true };
        }
        case "state.get": {
          assertRecord(call.input, "state.get input must be an object");
          return stateTools.get(String(call.input.namespace ?? ""), String(call.input.key ?? ""));
        }
        case "state.list": {
          assertRecord(call.input, "state.list input must be an object");
          return stateTools.list(String(call.input.namespace ?? ""));
        }
        case "state.delete": {
          assertRecord(call.input, "state.delete input must be an object");
          stateTools.delete(String(call.input.namespace ?? ""), String(call.input.key ?? ""));
          return { ok: true };
        }
        case "run.get":
          return runTools.get(String(call.input));
        case "run.list":
          return runTools.list(String(call.input));
        case "run.events":
          return runTools.events(String(call.input));
        case "run.cancel":
          return runTools.cancel(String(call.input));
        case "schedule.get":
          return scheduleTools.get(String(call.input));
        case "schedule.due":
          return scheduleTools.due();
        case "webhook.respond":
          return { ok: true, response: call.input };
        default:
          throw new Error(`unknown tool: ${call.name}`);
      }
    },
  };
}
