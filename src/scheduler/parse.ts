import { Cron } from "croner";
import type { ScheduleSpec } from "./types.js";

const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)$/u;
const DURATION_FACTORS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function parseScheduleSpec(value: unknown): ScheduleSpec {
  if (!isRecord(value)) {
    throw new Error("schedule must be an object");
  }
  if (typeof value.at === "string") {
    return { at: value.at };
  }
  if (typeof value.every === "string") {
    return { every: value.every };
  }
  if (typeof value.cron === "string") {
    return {
      cron: value.cron,
      ...(typeof value.timezone === "string" ? { timezone: value.timezone } : {}),
    };
  }
  throw new Error("schedule must contain at, every, or cron");
}

export function parseEveryDurationMs(value: string): number {
  const match = value.trim().match(DURATION_PATTERN);
  if (!match) {
    throw new Error(`invalid every duration: ${value}`);
  }
  const amount = Number.parseInt(match[1] ?? "", 10);
  const unit = match[2] ?? "";
  const factor = DURATION_FACTORS[unit];
  if (!Number.isFinite(amount) || amount <= 0 || factor === undefined) {
    throw new Error(`invalid every duration: ${value}`);
  }
  return amount * factor;
}

export function computeNextRunAtMs(schedule: ScheduleSpec, afterMs: number): number | null {
  if ("at" in schedule) {
    const atMs = Date.parse(schedule.at);
    if (!Number.isFinite(atMs)) {
      throw new Error(`invalid at schedule: ${schedule.at}`);
    }
    return atMs > afterMs ? atMs : null;
  }

  if ("every" in schedule) {
    return afterMs + parseEveryDurationMs(schedule.every);
  }

  const cron = new Cron(schedule.cron, {
    paused: true,
    ...(schedule.timezone ? { timezone: schedule.timezone } : {}),
  });
  return cron.nextRun(new Date(afterMs))?.getTime() ?? null;
}
