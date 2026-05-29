import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRunService, RunConflictError, RunNotFoundError } from "../../src/runs/service.js";
import { openIclawDatabase } from "../../src/storage/sqlite.js";

describe("run service", () => {
  it("creates a queued run and records run.queued event", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "iclaw-runs-test-"));
    const dbPath = path.join(tempDir, "state.sqlite");

    try {
      const db = openIclawDatabase(dbPath);
      const runService = createRunService(db);

      const run = runService.createRun({
        agentId: "main",
        triggerType: "api",
        input: { text: "hello" },
      });

      runService.appendEvent(run.id, {
        type: "run.queued",
        payload: { status: "queued" },
      });

      const events = runService.listEvents(run.id);
      expect(run.status).toBe("queued");
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("run.queued");

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("raises duplicate idempotency conflicts deterministically", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "iclaw-runs-test-"));
    const dbPath = path.join(tempDir, "state.sqlite");

    try {
      const db = openIclawDatabase(dbPath);
      const runService = createRunService(db);

      runService.createRun({
        agentId: "main",
        triggerType: "api",
        triggerId: "req-1",
        idempotencyKey: "idem-1",
        input: { text: "hello" },
      });

      expect(() =>
        runService.createRun({
          agentId: "main",
          triggerType: "api",
          triggerId: "req-1",
          idempotencyKey: "idem-1",
          input: { text: "hello again" },
        }),
      ).toThrowError(RunConflictError);

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("auto-sequences events from max existing seq plus one", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "iclaw-runs-test-"));
    const dbPath = path.join(tempDir, "state.sqlite");

    try {
      const db = openIclawDatabase(dbPath);
      const runService = createRunService(db);

      const run = runService.createRun({
        agentId: "main",
        triggerType: "api",
        input: { text: "hello" },
      });

      runService.appendEvent(run.id, {
        type: "run.test",
        payload: { first: true },
        seq: 5,
      });
      const autoEvent = runService.appendEvent(run.id, {
        type: "run.test",
        payload: { second: true },
      });

      expect(autoEvent.seq).toBe(6);

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects appending events for unknown runs", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "iclaw-runs-test-"));
    const dbPath = path.join(tempDir, "state.sqlite");

    try {
      const db = openIclawDatabase(dbPath);
      const runService = createRunService(db);

      expect(() =>
        runService.appendEvent("missing-run", {
          type: "run.queued",
          payload: {},
        }),
      ).toThrowError(RunNotFoundError);

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
