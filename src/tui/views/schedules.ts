import type { Schedule } from "../../scheduler/types.js";

export type SchedulesView = {
  title: "Schedules";
  rows: Array<{
    id: string;
    agentId: string;
    enabled: boolean;
    schedule: string;
    nextRunAtMs: number | null;
    lastRunId: string | null;
  }>;
};

function formatSchedule(schedule: Schedule["schedule"]): string {
  if ("at" in schedule) {
    return `at ${schedule.at}`;
  }
  if ("every" in schedule) {
    return `every ${schedule.every}`;
  }
  return schedule.timezone ? `cron ${schedule.cron} ${schedule.timezone}` : `cron ${schedule.cron}`;
}

export function buildSchedulesView(schedules: Schedule[]): SchedulesView {
  return {
    title: "Schedules",
    rows: schedules.map((schedule) => ({
      id: schedule.id,
      agentId: schedule.agentId,
      enabled: schedule.enabled,
      schedule: formatSchedule(schedule.schedule),
      nextRunAtMs: schedule.nextRunAtMs,
      lastRunId: schedule.lastRunId,
    })),
  };
}
