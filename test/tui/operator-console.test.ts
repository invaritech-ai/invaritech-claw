import { describe, expect, it, vi } from "vitest";
import type { Run } from "../../src/runs/types.js";
import type { Schedule } from "../../src/scheduler/types.js";
import {
  createNativeOperatorApiClient,
  type ApprovalView,
  type NativeOperatorApiClient,
  type OperatorStatus,
} from "../../src/tui/operator-api.js";
import {
  approveRun,
  buildOperatorActiveView,
  createOperatorConsoleState,
  getWaitingRunApprovalControls,
  refreshOperatorView,
  rejectRun,
  switchOperatorView,
} from "../../src/tui/operator-console.js";
import type { Webhook } from "../../src/webhooks/types.js";

function sampleRun(input: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    agentId: "main",
    triggerType: "api",
    triggerId: null,
    status: "queued",
    input: {},
    result: null,
    error: null,
    approvalId: null,
    idempotencyKey: null,
    createdAtMs: 1,
    startedAtMs: null,
    finishedAtMs: null,
    ...input,
  };
}

function sampleApproval(input: Partial<ApprovalView> = {}): ApprovalView {
  return {
    id: "approval-1",
    runId: "run-1",
    status: "approved",
    request: {},
    decision: null,
    expiresAtMs: 10,
    createdAtMs: 1,
    decidedAtMs: 2,
    ...input,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("operator console state", () => {
  it("switches between chat, runs, schedules, webhooks, and status views", () => {
    let state = createOperatorConsoleState({ selectedAgentId: "main" });

    for (const view of ["chat", "runs", "schedules", "webhooks", "status"] as const) {
      state = switchOperatorView(state, view);
      expect(state.activeView).toBe(view);
      expect(buildOperatorActiveView(state).title.toLowerCase()).toBe(view);
    }
  });

  it("refreshes native operator views through the API client", async () => {
    const runs = [sampleRun()];
    const schedules: Schedule[] = [
      {
        id: "schedule-1",
        agentId: "main",
        enabled: true,
        schedule: { every: "5m" },
        input: {},
        approvalMode: "fail",
        nextRunAtMs: 10,
        lastRunId: null,
        createdAtMs: 1,
        updatedAtMs: 1,
      },
    ];
    const webhooks: Webhook[] = [
      {
        id: "ingest",
        path: "/webhooks/ingest",
        agentId: "main",
        config: { idempotencyHeader: "x-event-id" },
        createdAtMs: 1,
        updatedAtMs: 1,
      },
    ];
    const status: OperatorStatus = { ok: true, databasePath: "/tmp/iclaw.sqlite" };
    const client: NativeOperatorApiClient = {
      listRuns: vi.fn(async () => runs),
      getRun: vi.fn(async () => runs[0]!),
      cancelRun: vi.fn(async () => runs[0]!),
      listSchedules: vi.fn(async () => schedules),
      createSchedule: vi.fn(async () => schedules[0]!),
      patchSchedule: vi.fn(async () => schedules[0]!),
      runScheduleNow: vi.fn(async () => runs[0]!),
      listWebhooks: vi.fn(async () => webhooks),
      deliverWebhook: vi.fn(async () => ({
        runId: "run-1",
        deliveryId: "delivery-1",
        duplicate: false,
      })),
      approveApproval: vi.fn(async () => sampleApproval()),
      rejectApproval: vi.fn(async () => sampleApproval({ status: "rejected" })),
      getStatus: vi.fn(async () => status),
    };

    let state = createOperatorConsoleState({ selectedAgentId: "main" });
    state = await refreshOperatorView(switchOperatorView(state, "runs"), client, 100);
    expect(state.runs).toEqual(runs);
    expect(client.listRuns).toHaveBeenCalledWith({ agentId: "main" });

    state = await refreshOperatorView(switchOperatorView(state, "schedules"), client, 101);
    expect(state.schedules).toEqual(schedules);
    expect(client.listSchedules).toHaveBeenCalled();

    state = await refreshOperatorView(switchOperatorView(state, "webhooks"), client, 102);
    expect(state.webhooks).toEqual(webhooks);
    expect(client.listWebhooks).toHaveBeenCalled();

    state = await refreshOperatorView(switchOperatorView(state, "status"), client, 103);
    expect(state.status).toEqual(status);
    expect(client.getStatus).toHaveBeenCalled();
  });

  it("exposes approve and reject controls for runs waiting on approval", async () => {
    const run = sampleRun({
      status: "waiting_approval",
      approvalId: "approval-1",
    });
    const approveApproval = vi.fn(async () => sampleApproval({ status: "approved" }));
    const rejectApproval = vi.fn(async () => sampleApproval({ status: "rejected" }));
    const client = {
      approveApproval,
      rejectApproval,
    } as Partial<NativeOperatorApiClient> as NativeOperatorApiClient;

    expect(getWaitingRunApprovalControls(run).map((action) => action.kind)).toEqual([
      "approve",
      "reject",
    ]);
    await approveRun(run, client, { ok: true });
    await rejectRun(run, client, { ok: false });

    expect(approveApproval).toHaveBeenCalledWith("approval-1", { ok: true });
    expect(rejectApproval).toHaveBeenCalledWith("approval-1", { ok: false });
  });
});

describe("native operator API client", () => {
  it("calls run, schedule, webhook, approval, and status endpoints", async () => {
    const calls: Array<{ url: URL; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      calls.push({ url, init });
      switch (url.pathname) {
        case "/runs":
          return jsonResponse({ runs: [sampleRun()] });
        case "/schedules":
          return jsonResponse({ schedules: [] });
        case "/webhooks":
          return jsonResponse({ webhooks: [] });
        case "/webhooks/ingest":
          return jsonResponse({ runId: "run-1", deliveryId: "delivery-1", duplicate: false }, 202);
        case "/approvals/approval-1/approve":
          return jsonResponse(sampleApproval({ status: "approved" }));
        case "/approvals/approval-1/reject":
          return jsonResponse(sampleApproval({ status: "rejected" }));
        case "/health":
          return jsonResponse({ ok: true });
        default:
          return jsonResponse({ error: "not found" }, 404);
      }
    });
    const client = createNativeOperatorApiClient({
      baseUrl: "http://127.0.0.1:48123",
      fetchImpl,
    });

    await client.listRuns({ agentId: "main", limit: 5 });
    await client.listSchedules(10);
    await client.listWebhooks(10);
    await client.deliverWebhook({
      webhookId: "ingest",
      secret: "secret-1",
      idempotencyKey: "evt-1",
      idempotencyHeader: "x-event-id",
      body: { text: "hello" },
    });
    await client.approveApproval("approval-1", { ok: true });
    await client.rejectApproval("approval-1", { ok: false });
    await client.getStatus();

    expect(calls.map((call) => `${call.init?.method ?? "GET"} ${call.url.pathname}`)).toEqual([
      "GET /runs",
      "GET /schedules",
      "GET /webhooks",
      "POST /webhooks/ingest",
      "POST /approvals/approval-1/approve",
      "POST /approvals/approval-1/reject",
      "GET /health",
    ]);
    expect(calls[0]?.url.searchParams.get("agentId")).toBe("main");
    expect(calls[0]?.url.searchParams.get("limit")).toBe("5");
    expect(calls[3]?.init?.headers).toMatchObject({
      "x-iclaw-webhook-secret": "secret-1",
      "x-event-id": "evt-1",
    });
  });
});
