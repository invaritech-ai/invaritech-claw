import type { DatabaseSync } from "node:sqlite";
import {
  getScheduleById,
  listDueSchedules,
  updateScheduleRunState,
  upsertSchedule,
} from "../storage/schedules.js";

export type ScheduleTools = ReturnType<typeof createScheduleTools>;

export function createScheduleTools(db: DatabaseSync) {
  return {
    get(scheduleId: string) {
      return getScheduleById(db, scheduleId);
    },
    due(nowMs = Date.now(), limit = 100) {
      return listDueSchedules(db, nowMs, limit);
    },
    upsert: upsertSchedule.bind(undefined, db),
    markRun(params: {
      scheduleId: string;
      lastRunId: string | null;
      nextRunAtMs: number | null;
      updatedAtMs?: number;
    }) {
      updateScheduleRunState(db, {
        scheduleId: params.scheduleId,
        lastRunId: params.lastRunId,
        nextRunAtMs: params.nextRunAtMs,
        updatedAtMs: params.updatedAtMs ?? Date.now(),
      });
    },
  };
}
