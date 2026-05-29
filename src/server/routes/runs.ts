import type { Express, NextFunction, Request, Response } from "express";
import { executeRun } from "../../agent/execute.js";
import type { ProviderRegistry } from "../../agent/model.js";
import type { ModelMessage } from "../../agent/types.js";
import type { AgentConfig } from "../../config/types.js";
import { isRunConflictError, type RunService } from "../../runs/service.js";
import type { RunTriggerType } from "../../storage/schema.js";

const RUN_TRIGGER_TYPES: ReadonlySet<RunTriggerType> = new Set(["tui", "api"]);

type CreateRunBody = {
  agentId?: unknown;
  triggerType?: unknown;
  triggerId?: unknown;
  input?: unknown;
  idempotencyKey?: unknown;
  execute?: unknown;
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function asOptionalString(value: unknown): string | null {
  if (!isString(value)) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRunTriggerType(value: unknown): value is RunTriggerType {
  return isString(value) && RUN_TRIGGER_TYPES.has(value as RunTriggerType);
}

function parsePositiveLimit(value: unknown): number | undefined {
  if (!isString(value)) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

type RunExecutionConfig = {
  agents: Record<string, AgentConfig>;
  providers: ProviderRegistry;
};

function readPromptText(input: unknown): string | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const text = (input as { text?: unknown }).text;
  if (!isString(text)) {
    return null;
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildMessages(agent: AgentConfig, prompt: string): ModelMessage[] {
  const messages: ModelMessage[] = [];
  if (agent.system?.trim()) {
    messages.push({ role: "system", content: agent.system.trim() });
  }
  messages.push({ role: "user", content: prompt });
  return messages;
}

export function attachRunRoutes(
  app: Express,
  runService: RunService,
  execution?: RunExecutionConfig,
): void {
  async function postRun(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as CreateRunBody;
    const agentId = asOptionalString(body.agentId);
    if (!agentId) {
      res.status(400).json({ error: "agentId is required" });
      return;
    }

    if (!isRunTriggerType(body.triggerType)) {
      res.status(400).json({ error: "invalid triggerType" });
      return;
    }

    const shouldExecute = body.execute === true;
    const agent = shouldExecute ? execution?.agents[agentId] : undefined;
    if (shouldExecute && !agent) {
      res.status(400).json({ error: `unknown agent: ${agentId}` });
      return;
    }
    const promptText = shouldExecute ? readPromptText(body.input) : null;
    if (shouldExecute && !promptText) {
      res.status(400).json({ error: "input.text is required for execution" });
      return;
    }

    try {
      let run = runService.createRun({
        agentId,
        triggerType: body.triggerType,
        triggerId: asOptionalString(body.triggerId),
        input: body.input,
        idempotencyKey: asOptionalString(body.idempotencyKey),
      });
      if (shouldExecute && agent && promptText) {
        run = await executeRun({
          runId: run.id,
          model: agent.model,
          messages: buildMessages(agent, promptText),
          providers: execution?.providers ?? {},
          runService,
        });
      }
      res.status(201).json(run);
    } catch (error) {
      if (isRunConflictError(error)) {
        res.status(409).json({
          error: {
            code: error.code,
            reason: error.reason,
            message: error.message,
          },
        });
        return;
      }
      throw error;
    }
  }

  app.post("/runs", (req: Request, res: Response, next: NextFunction) => {
    void postRun(req, res).catch(next);
  });

  app.get("/runs", (req, res) => {
    const agentId = asOptionalString(req.query.agentId);
    if (!agentId) {
      res.status(400).json({ error: "agentId is required" });
      return;
    }
    const runs = runService.listRuns({
      agentId,
      limit: parsePositiveLimit(req.query.limit),
    });
    res.json({ runs });
  });

  app.get("/runs/:id", (req, res) => {
    const runId = asOptionalString(req.params.id);
    if (!runId) {
      res.status(400).json({ error: "run id is required" });
      return;
    }
    const run = runService.getRun(runId);
    if (!run) {
      res.status(404).json({ error: "run not found" });
      return;
    }
    res.json(run);
  });

  app.get("/runs/:id/events", (req, res) => {
    const runId = asOptionalString(req.params.id);
    if (!runId) {
      res.status(400).json({ error: "run id is required" });
      return;
    }
    const run = runService.getRun(runId);
    if (!run) {
      res.status(404).json({ error: "run not found" });
      return;
    }
    res.json({ events: runService.listEvents(runId) });
  });

  app.post("/runs/:id/cancel", (req, res) => {
    const runId = asOptionalString(req.params.id);
    if (!runId) {
      res.status(400).json({ error: "run id is required" });
      return;
    }
    const run = runService.cancelRun(runId);
    if (!run) {
      res.status(404).json({ error: "run not found" });
      return;
    }
    res.json(run);
  });
}
