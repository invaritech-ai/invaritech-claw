import type { Express } from "express";
import type { ApprovalService } from "../../approvals/service.js";

type DecisionBody = {
  decision?: unknown;
};

export function attachApprovalRoutes(app: Express, approvalService: ApprovalService): void {
  app.post("/approvals/:id/approve", (req, res) => {
    const approvalId = String(req.params.id ?? "").trim();
    if (!approvalId) {
      res.status(400).json({ error: "approval id is required" });
      return;
    }
    const body = (req.body ?? {}) as DecisionBody;
    const approval = approvalService.approve(approvalId, body.decision);
    if (!approval) {
      res.status(404).json({ error: "approval not found" });
      return;
    }
    res.json(approval);
  });

  app.post("/approvals/:id/reject", (req, res) => {
    const approvalId = String(req.params.id ?? "").trim();
    if (!approvalId) {
      res.status(400).json({ error: "approval id is required" });
      return;
    }
    const body = (req.body ?? {}) as DecisionBody;
    const approval = approvalService.reject(approvalId, body.decision);
    if (!approval) {
      res.status(404).json({ error: "approval not found" });
      return;
    }
    res.json(approval);
  });
}
