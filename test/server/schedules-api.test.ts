import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import express from "express";
import { describe, expect, it } from "vitest";
import { createRunService } from "../../src/runs/service.js";
import { createSchedulerService } from "../../src/scheduler/service.js";
import { attachScheduleRoutes } from "../../src/server/routes/schedules.js";
import { openIclawDatabase } from "../../src/storage/sqlite.js";

async function startServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "iclaw-schedules-api-"));
  const db = openIclawDatabase(path.join(dir, "state.sqlite"));
  const runService = createRunService(db);
  const scheduler = createSchedulerService({ db, runService });
  const app = express();
  app.use(express.json());
  attachScheduleRoutes(app, scheduler);
  const server = await new Promise<Server>((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("schedule API", () => {
  it("supports create/list/patch/manual run/delete", async () => {
    const server = await startServer();
    try {
      const createResponse = await fetch(`${server.baseUrl}/schedules`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "morning",
          agentId: "main",
          schedule: { every: "5m" },
          input: { text: "wake" },
        }),
      });
      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as { id: string; enabled: boolean };
      expect(created).toMatchObject({ id: "morning", enabled: true });

      const listResponse = await fetch(`${server.baseUrl}/schedules`);
      expect(listResponse.status).toBe(200);
      const listBody = (await listResponse.json()) as { schedules: Array<{ id: string }> };
      expect(listBody.schedules.map((schedule) => schedule.id)).toContain("morning");

      const patchResponse = await fetch(`${server.baseUrl}/schedules/morning`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      expect(patchResponse.status).toBe(200);
      const patched = (await patchResponse.json()) as {
        enabled: boolean;
        nextRunAtMs: number | null;
      };
      expect(patched.enabled).toBe(false);
      expect(patched.nextRunAtMs).toBeNull();

      const runResponse = await fetch(`${server.baseUrl}/schedules/morning/run`, {
        method: "POST",
      });
      expect(runResponse.status).toBe(201);
      const run = (await runResponse.json()) as { triggerType: string; triggerId: string };
      expect(run).toMatchObject({ triggerType: "schedule", triggerId: "morning" });

      const deleteResponse = await fetch(`${server.baseUrl}/schedules/morning`, {
        method: "DELETE",
      });
      expect(deleteResponse.status).toBe(204);
    } finally {
      await server.close();
    }
  });
});
