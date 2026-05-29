import type { Run } from "../runs/types.js";
import type { Schedule, CreateScheduleInput, PatchScheduleInput } from "../scheduler/types.js";
import type { ApprovalStatus } from "../storage/schema.js";
import type { Webhook } from "../webhooks/types.js";

export type ApprovalView = {
  id: string;
  runId: string;
  status: ApprovalStatus;
  request: unknown;
  decision: unknown | null;
  expiresAtMs: number;
  createdAtMs: number;
  decidedAtMs: number | null;
};

export type OperatorStatus = {
  ok: boolean;
  serverTimeMs?: number;
  databasePath?: string;
  providerHealth?: Record<string, unknown>;
  [key: string]: unknown;
};

export type WebhookDeliveryResponse = {
  runId: string;
  deliveryId: string;
  duplicate: boolean;
};

export type DeliverWebhookInput = {
  webhookId: string;
  secret: string;
  body: unknown;
  idempotencyKey?: string;
  idempotencyHeader?: string;
};

export type NativeOperatorApiClient = {
  listRuns(input: { agentId: string; limit?: number }): Promise<Run[]>;
  getRun(runId: string): Promise<Run>;
  cancelRun(runId: string): Promise<Run>;
  listSchedules(limit?: number): Promise<Schedule[]>;
  createSchedule(input: CreateScheduleInput): Promise<Schedule>;
  patchSchedule(scheduleId: string, input: PatchScheduleInput): Promise<Schedule>;
  runScheduleNow(scheduleId: string): Promise<Run>;
  listWebhooks(limit?: number): Promise<Webhook[]>;
  deliverWebhook(input: DeliverWebhookInput): Promise<WebhookDeliveryResponse>;
  approveApproval(approvalId: string, decision?: unknown): Promise<ApprovalView>;
  rejectApproval(approvalId: string, decision?: unknown): Promise<ApprovalView>;
  getStatus(): Promise<OperatorStatus>;
};

type FetchLike = (input: URL, init?: RequestInit) => Promise<Response>;

export class NativeOperatorApiError extends Error {
  status: number;
  path: string;
  responseText: string;

  constructor(input: { status: number; path: string; responseText: string }) {
    super(`native API request failed: ${input.status} ${input.path}`);
    this.name = "NativeOperatorApiError";
    this.status = input.status;
    this.path = input.path;
    this.responseText = input.responseText;
  }
}

function appendQuery(url: URL, query?: Record<string, string | number | undefined>): URL {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export function createNativeOperatorApiClient(input: {
  baseUrl: string;
  fetchImpl?: FetchLike;
}): NativeOperatorApiClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = input.baseUrl.endsWith("/") ? input.baseUrl : `${input.baseUrl}/`;

  async function requestJson<T>(
    path: string,
    options: {
      method?: string;
      query?: Record<string, string | number | undefined>;
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const url = appendQuery(new URL(path.replace(/^\//u, ""), baseUrl), options.query);
    const headers: Record<string, string> = { ...options.headers };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    const response = await fetchImpl(url, {
      method: options.method ?? "GET",
      headers,
      body,
    });
    if (!response.ok) {
      throw new NativeOperatorApiError({
        status: response.status,
        path,
        responseText: await response.text(),
      });
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  return {
    async listRuns({ agentId, limit }) {
      const response = await requestJson<{ runs: Run[] }>("/runs", {
        query: { agentId, limit },
      });
      return response.runs;
    },

    async getRun(runId) {
      return await requestJson<Run>(`/runs/${encodeURIComponent(runId)}`);
    },

    async cancelRun(runId) {
      return await requestJson<Run>(`/runs/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        body: {},
      });
    },

    async listSchedules(limit) {
      const response = await requestJson<{ schedules: Schedule[] }>("/schedules", {
        query: { limit },
      });
      return response.schedules;
    },

    async createSchedule(schedule) {
      return await requestJson<Schedule>("/schedules", {
        method: "POST",
        body: schedule,
      });
    },

    async patchSchedule(scheduleId, schedule) {
      return await requestJson<Schedule>(`/schedules/${encodeURIComponent(scheduleId)}`, {
        method: "PATCH",
        body: schedule,
      });
    },

    async runScheduleNow(scheduleId) {
      return await requestJson<Run>(`/schedules/${encodeURIComponent(scheduleId)}/run`, {
        method: "POST",
        body: {},
      });
    },

    async listWebhooks(limit) {
      const response = await requestJson<{ webhooks: Webhook[] }>("/webhooks", {
        query: { limit },
      });
      return response.webhooks;
    },

    async deliverWebhook(delivery) {
      const headers: Record<string, string> = {
        "x-iclaw-webhook-secret": delivery.secret,
      };
      if (delivery.idempotencyKey) {
        headers[delivery.idempotencyHeader ?? "x-idempotency-key"] = delivery.idempotencyKey;
      }
      return await requestJson<WebhookDeliveryResponse>(
        `/webhooks/${encodeURIComponent(delivery.webhookId)}`,
        {
          method: "POST",
          headers,
          body: delivery.body,
        },
      );
    },

    async approveApproval(approvalId, decision) {
      return await requestJson<ApprovalView>(
        `/approvals/${encodeURIComponent(approvalId)}/approve`,
        {
          method: "POST",
          body: { decision },
        },
      );
    },

    async rejectApproval(approvalId, decision) {
      return await requestJson<ApprovalView>(
        `/approvals/${encodeURIComponent(approvalId)}/reject`,
        {
          method: "POST",
          body: { decision },
        },
      );
    },

    async getStatus() {
      return await requestJson<OperatorStatus>("/health");
    },
  };
}
