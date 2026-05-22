import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import express from "express";
import { describe, expect, it } from "vitest";
import { createApprovalService } from "../../src/approvals/service.js";
import { createRunService } from "../../src/runs/service.js";
import { attachApprovalRoutes } from "../../src/server/routes/approvals.js";
import { openIclawDatabase } from "../../src/storage/sqlite.js";

describe("approval service", () => {
  it("updates approval rows on approve/reject", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "iclaw-approvals-service-"));
    const db = openIclawDatabase(path.join(dir, "state.sqlite"));
    try {
      const runService = createRunService(db);
      const run = runService.createRun({
        agentId: "main",
        triggerType: "api",
        input: { text: "hello" },
      });
      const approvals = createApprovalService(db);
      const created = approvals.createPendingApproval({
        runId: run.id,
        request: { tool: "http.request" },
      });
      const approved = approvals.approve(created.id, { reason: "ok" });
      expect(approved?.status).toBe("approved");

      const created2 = approvals.createPendingApproval({
        runId: run.id,
        request: { tool: "http.request" },
      });
      const rejected = approvals.reject(created2.id, { reason: "nope" });
      expect(rejected?.status).toBe("rejected");
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exposes approve/reject HTTP endpoints", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "iclaw-approvals-routes-"));
    const db = openIclawDatabase(path.join(dir, "state.sqlite"));
    let baseUrl = "";
    try {
      const runService = createRunService(db);
      const run = runService.createRun({
        agentId: "main",
        triggerType: "api",
        input: { text: "hello" },
      });
      const approvals = createApprovalService(db);
      const created = approvals.createPendingApproval({
        runId: run.id,
        request: { tool: "http.request" },
      });

      const app = express();
      app.use(express.json());
      attachApprovalRoutes(app, approvals);
      const server = await new Promise<import("node:http").Server>((resolve) => {
        const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
      });
      try {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;

        const approveResponse = await fetch(`${baseUrl}/approvals/${created.id}/approve`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: { by: "operator" } }),
        });
        expect(approveResponse.status).toBe(200);
        const approved = (await approveResponse.json()) as { status: string };
        expect(approved.status).toBe("approved");

        const created2 = approvals.createPendingApproval({
          runId: run.id,
          request: { tool: "http.request" },
        });
        const rejectResponse = await fetch(`${baseUrl}/approvals/${created2.id}/reject`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: { by: "operator" } }),
        });
        expect(rejectResponse.status).toBe(200);
        const rejected = (await rejectResponse.json()) as { status: string };
        expect(rejected.status).toBe("rejected");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
