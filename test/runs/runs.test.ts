import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRunService } from "../../src/runs/service.js";
import { openIclawDatabase } from "../../src/storage/sqlite.js";

describe("run service", () => {
  it("creates a queued run and records run.queued event", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "openclaw-runs-test-"));
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
});
