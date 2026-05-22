import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createApprovalService } from "../../src/approvals/service.js";
import { createRunService } from "../../src/runs/service.js";
import { openIclawDatabase } from "../../src/storage/sqlite.js";
import { createToolRegistry } from "../../src/tools/registry.js";

describe("tool policy", () => {
  it("denies http.request by default and allows declared host/method/path", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "iclaw-tools-policy-"));
    const db = openIclawDatabase(path.join(dir, "state.sqlite"));
    try {
      const runService = createRunService(db);
      const approvalService = createApprovalService(db);
      const fetchFn = vi.fn(async () => new Response("ok", { status: 200 }));

      const denyRegistry = createToolRegistry({
        db,
        runService,
        approvalService,
        httpPolicy: { allow: [] },
        fetchFn,
      });

      await expect(
        denyRegistry.invoke({
          runId: "r1",
          name: "http.request",
          input: { url: "https://example.com/a", method: "GET" },
        }),
      ).rejects.toThrow("http.request denied by policy");

      const allowRegistry = createToolRegistry({
        db,
        runService,
        approvalService,
        httpPolicy: {
          allow: [{ host: "example.com", method: "GET", path: "/a" }],
        },
        fetchFn,
      });

      const result = await allowRegistry.invoke({
        runId: "r1",
        name: "http.request",
        input: { url: "https://example.com/a/b", method: "GET" },
      });
      expect(result).toEqual({ status: 200, body: "ok" });
      expect(fetchFn).toHaveBeenCalledOnce();
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("moves run to waiting_approval when a tool call requires approval", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "iclaw-tools-approval-"));
    const db = openIclawDatabase(path.join(dir, "state.sqlite"));
    try {
      const runService = createRunService(db);
      const approvalService = createApprovalService(db);
      const registry = createToolRegistry({
        db,
        runService,
        approvalService,
        httpPolicy: { allow: [] },
      });

      const run = runService.createRun({
        agentId: "main",
        triggerType: "api",
        input: { text: "approve me" },
      });

      const result = (await registry.invoke({
        runId: run.id,
        name: "http.request",
        input: { url: "https://example.com/a", method: "GET" },
        requireApproval: true,
      })) as { status: string; approvalId: string };

      expect(result.status).toBe("waiting_approval");
      const updatedRun = runService.getRun(run.id);
      expect(updatedRun?.status).toBe("waiting_approval");
      expect(updatedRun?.approvalId).toBe(result.approvalId);

      const approval = approvalService.getApproval(result.approvalId);
      expect(approval?.status).toBe("pending");
      expect(approval?.runId).toBe(run.id);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
