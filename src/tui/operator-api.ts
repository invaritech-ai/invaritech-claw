import type { LegacyRun, LegacyRunTriggerType } from "./legacy-run-types.js";

export type OperatorStatus = {
  ok: boolean;
  serverTimeMs?: number;
  databasePath?: string;
  [key: string]: unknown;
};

export type NativeOperatorApiClient = {
  createRun(input: {
    agentId: string;
    triggerType: LegacyRunTriggerType;
    triggerId?: string | null;
    input?: unknown;
    idempotencyKey?: string | null;
    execute?: boolean;
  }): Promise<LegacyRun>;
  listRuns(input: { agentId: string; limit?: number }): Promise<LegacyRun[]>;
  getRun(runId: string): Promise<LegacyRun>;
  cancelRun(runId: string): Promise<LegacyRun>;
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
    async createRun(run) {
      return await requestJson<LegacyRun>("/runs", {
        method: "POST",
        body: run,
      });
    },

    async listRuns({ agentId, limit }) {
      const response = await requestJson<{ runs: LegacyRun[] }>("/runs", {
        query: { agentId, limit },
      });
      return response.runs;
    },

    async getRun(runId) {
      return await requestJson<LegacyRun>(`/runs/${encodeURIComponent(runId)}`);
    },

    async cancelRun(runId) {
      return await requestJson<LegacyRun>(`/runs/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        body: {},
      });
    },

    async getStatus() {
      return await requestJson<OperatorStatus>("/health");
    },
  };
}
