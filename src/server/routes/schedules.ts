import type { Express } from "express";
import { parseScheduleSpec } from "../../scheduler/parse.js";
import type { SchedulerService } from "../../scheduler/service.js";

type ScheduleBody = {
  id?: unknown;
  agentId?: unknown;
  schedule?: unknown;
  input?: unknown;
  approvalMode?: unknown;
  enabled?: unknown;
};

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalApprovalMode(value: unknown): "fail" | "pause" | undefined {
  return value === "fail" || value === "pause" ? value : undefined;
}

function parseApprovalMode(value: unknown): "fail" | "pause" | undefined {
  if (value === undefined) {
    return undefined;
  }
  const approvalMode = optionalApprovalMode(value);
  if (!approvalMode) {
    throw new Error("approvalMode must be fail or pause");
  }
  return approvalMode;
}

function positiveLimit(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function attachScheduleRoutes(app: Express, scheduler: SchedulerService): void {
  app.get("/schedules", (req, res) => {
    res.json({ schedules: scheduler.listSchedules(positiveLimit(req.query.limit)) });
  });

  app.post("/schedules", (req, res) => {
    const body = (req.body ?? {}) as ScheduleBody;
    const agentId = optionalString(body.agentId);
    if (!agentId) {
      res.status(400).json({ error: "agentId is required" });
      return;
    }
    try {
      const schedule = scheduler.createSchedule({
        id: optionalString(body.id),
        agentId,
        schedule: parseScheduleSpec(body.schedule),
        input: body.input ?? {},
        approvalMode: parseApprovalMode(body.approvalMode),
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      });
      res.status(201).json(schedule);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/schedules/:id", (req, res) => {
    const scheduleId = optionalString(req.params.id);
    if (!scheduleId) {
      res.status(400).json({ error: "schedule id is required" });
      return;
    }
    const schedule = scheduler.getSchedule(scheduleId);
    if (!schedule) {
      res.status(404).json({ error: "schedule not found" });
      return;
    }
    res.json(schedule);
  });

  app.patch("/schedules/:id", (req, res) => {
    const scheduleId = optionalString(req.params.id);
    if (!scheduleId) {
      res.status(400).json({ error: "schedule id is required" });
      return;
    }
    const body = (req.body ?? {}) as ScheduleBody;
    try {
      const schedule = scheduler.patchSchedule(scheduleId, {
        agentId: optionalString(body.agentId),
        schedule: body.schedule === undefined ? undefined : parseScheduleSpec(body.schedule),
        input: body.input,
        approvalMode: parseApprovalMode(body.approvalMode),
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      });
      if (!schedule) {
        res.status(404).json({ error: "schedule not found" });
        return;
      }
      res.json(schedule);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/schedules/:id", (req, res) => {
    const scheduleId = optionalString(req.params.id);
    if (!scheduleId) {
      res.status(400).json({ error: "schedule id is required" });
      return;
    }
    if (!scheduler.deleteSchedule(scheduleId)) {
      res.status(404).json({ error: "schedule not found" });
      return;
    }
    res.status(204).end();
  });

  app.post("/schedules/:id/run", (req, res) => {
    const scheduleId = optionalString(req.params.id);
    if (!scheduleId) {
      res.status(400).json({ error: "schedule id is required" });
      return;
    }
    const run = scheduler.runScheduleNow(scheduleId);
    if (!run) {
      res.status(404).json({ error: "schedule not found" });
      return;
    }
    res.status(201).json(run);
  });
}
