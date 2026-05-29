import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { RunService } from "../runs/service.js";
import {
  deleteSchedule,
  getScheduleById,
  listDueSchedules,
  listSchedules,
  updateScheduleRunState,
  upsertSchedule,
} from "../storage/schedules.js";
import type { ScheduleRecord } from "../storage/schema.js";
import { computeNextRunAtMs } from "./parse.js";
import type { CreateScheduleInput, PatchScheduleInput, Schedule, ScheduleSpec } from "./types.js";

function serializeJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? "null" : serialized;
}

function deserializeJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function mapScheduleRecord(record: ScheduleRecord): Schedule {
  return {
    id: record.id,
    agentId: record.agentId,
    enabled: record.enabled,
    schedule: deserializeJson(record.scheduleJson) as ScheduleSpec,
    input: deserializeJson(record.inputJson),
    approvalMode: record.approvalMode,
    nextRunAtMs: record.nextRunAtMs,
    lastRunId: record.lastRunId,
    createdAtMs: record.createdAtMs,
    updatedAtMs: record.updatedAtMs,
  };
}

export type SchedulerService = ReturnType<typeof createSchedulerService>;

export function createSchedulerService(input: { db: DatabaseSync; runService: RunService }) {
  const service = {
    createSchedule(scheduleInput: CreateScheduleInput): Schedule {
      const nowMs = scheduleInput.nowMs ?? Date.now();
      const enabled = scheduleInput.enabled ?? true;
      const record: ScheduleRecord = {
        id: scheduleInput.id ?? crypto.randomUUID(),
        agentId: scheduleInput.agentId,
        enabled,
        scheduleJson: serializeJson(scheduleInput.schedule),
        inputJson: serializeJson(scheduleInput.input ?? {}),
        approvalMode: scheduleInput.approvalMode ?? "fail",
        nextRunAtMs: enabled ? computeNextRunAtMs(scheduleInput.schedule, nowMs) : null,
        lastRunId: null,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      };
      upsertSchedule(input.db, record);
      return mapScheduleRecord(record);
    },

    getSchedule(scheduleId: string): Schedule | undefined {
      const record = getScheduleById(input.db, scheduleId);
      return record ? mapScheduleRecord(record) : undefined;
    },

    listSchedules(limit = 100): Schedule[] {
      return listSchedules(input.db, limit).map(mapScheduleRecord);
    },

    patchSchedule(scheduleId: string, patch: PatchScheduleInput): Schedule | undefined {
      const current = getScheduleById(input.db, scheduleId);
      if (!current) {
        return undefined;
      }
      const nowMs = patch.nowMs ?? Date.now();
      const schedule = patch.schedule ?? (deserializeJson(current.scheduleJson) as ScheduleSpec);
      const enabled = patch.enabled ?? current.enabled;
      const record: ScheduleRecord = {
        ...current,
        agentId: patch.agentId ?? current.agentId,
        enabled,
        scheduleJson: serializeJson(schedule),
        inputJson: patch.input === undefined ? current.inputJson : serializeJson(patch.input),
        approvalMode: patch.approvalMode ?? current.approvalMode,
        nextRunAtMs: enabled ? computeNextRunAtMs(schedule, nowMs) : null,
        updatedAtMs: nowMs,
      };
      upsertSchedule(input.db, record);
      return mapScheduleRecord(record);
    },

    deleteSchedule(scheduleId: string): boolean {
      const current = getScheduleById(input.db, scheduleId);
      if (!current) {
        return false;
      }
      deleteSchedule(input.db, scheduleId);
      return true;
    },

    listDueSchedules(nowMs = Date.now(), limit = 100): Schedule[] {
      return listDueSchedules(input.db, nowMs, limit).map(mapScheduleRecord);
    },

    runScheduleNow(scheduleId: string, nowMs = Date.now()) {
      const schedule = service.getSchedule(scheduleId);
      if (!schedule) {
        return undefined;
      }
      const run = input.runService.createRun({
        agentId: schedule.agentId,
        triggerType: "schedule",
        triggerId: schedule.id,
        input: schedule.input,
        createdAtMs: nowMs,
      });
      input.runService.appendEvent(run.id, {
        type: "run.queued",
        payload: { scheduleId: schedule.id },
        createdAtMs: nowMs,
      });
      const nextRunAtMs = schedule.enabled ? computeNextRunAtMs(schedule.schedule, nowMs) : null;
      updateScheduleRunState(input.db, {
        scheduleId: schedule.id,
        lastRunId: run.id,
        nextRunAtMs,
        updatedAtMs: nowMs,
      });
      return run;
    },

    runDueSchedules(nowMs = Date.now(), limit = 100) {
      return service
        .listDueSchedules(nowMs, limit)
        .map((schedule) => service.runScheduleNow(schedule.id, nowMs))
        .filter((run): run is NonNullable<typeof run> => run !== undefined);
    },
  };
  return service;
}
