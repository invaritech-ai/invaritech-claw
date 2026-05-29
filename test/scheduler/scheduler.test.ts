import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRunService } from "../../src/runs/service.js";
import { computeNextRunAtMs, parseScheduleSpec } from "../../src/scheduler/parse.js";
import { createSchedulerService } from "../../src/scheduler/service.js";
import { openIclawDatabase } from "../../src/storage/sqlite.js";

describe("schedule parser", () => {
  it("supports one-shot at schedules", () => {
    const spec = parseScheduleSpec({ at: "2026-05-19T09:00:00+08:00" });
    expect(computeNextRunAtMs(spec, Date.parse("2026-05-18T00:00:00Z"))).toBe(
      Date.parse("2026-05-19T09:00:00+08:00"),
    );
  });

  it("supports interval schedules", () => {
    const spec = parseScheduleSpec({ every: "5m" });
    expect(computeNextRunAtMs(spec, Date.parse("2026-05-19T00:00:00Z"))).toBe(
      Date.parse("2026-05-19T00:05:00Z"),
    );
  });

  it("supports cron schedules with timezone", () => {
    const spec = parseScheduleSpec({ cron: "0 9 * * *", timezone: "Asia/Hong_Kong" });
    expect(computeNextRunAtMs(spec, Date.parse("2026-05-18T00:00:00Z"))).toBe(
      Date.parse("2026-05-18T09:00:00+08:00"),
    );
  });
});

describe("scheduler service", () => {
  it("persists due schedules and creates schedule-triggered runs", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "iclaw-scheduler-"));
    const db = openIclawDatabase(path.join(dir, "state.sqlite"));
    try {
      const runService = createRunService(db);
      const scheduler = createSchedulerService({ db, runService });
      const nowMs = Date.parse("2026-05-19T00:00:00Z");
      const schedule = scheduler.createSchedule({
        id: "morning",
        agentId: "main",
        schedule: { every: "5m" },
        input: { text: "wake" },
        nowMs,
      });

      expect(schedule.nextRunAtMs).toBe(Date.parse("2026-05-19T00:05:00Z"));
      expect(scheduler.listDueSchedules(nowMs)).toEqual([]);

      const runs = scheduler.runDueSchedules(Date.parse("2026-05-19T00:05:00Z"));
      expect(runs).toHaveLength(1);
      expect(runs[0]?.triggerType).toBe("schedule");
      expect(runs[0]?.triggerId).toBe("morning");

      const updated = scheduler.getSchedule("morning");
      expect(updated?.lastRunId).toBe(runs[0]?.id);
      expect(updated?.nextRunAtMs).toBe(Date.parse("2026-05-19T00:10:00Z"));
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
