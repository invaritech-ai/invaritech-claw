import type { ModelMessage } from "../agent/types.js";
import type { ListedProviderModel } from "../server/providers.js";
import type {
  MemoryScope,
  MemoryType,
  Thread,
  ThreadMemory,
  ThreadMessage,
  ThreadSummary,
} from "../threads/types.js";

export type OperatorStatus = {
  ok: boolean;
  serverTimeMs?: number;
  databasePath?: string;
  [key: string]: unknown;
};

export type OperatorContextSections = {
  objective: string;
  memories: string;
  summary: string | null;
  recentMessageCount: number;
};

export type OperatorMessageContext = {
  tokenEstimate: number;
  sections: OperatorContextSections;
  usedMemories: ThreadMemory[];
};

export type OperatorThreadContext = OperatorMessageContext & {
  messages: ModelMessage[];
};

export type OperatorPostMessageResponse = {
  message: ThreadMessage;
  invocationId: string;
  context: OperatorMessageContext;
};

export type OperatorContextResponse = {
  context: OperatorThreadContext;
};

export type OperatorCompactResponse = {
  summary: ThreadSummary;
  invocationId: string;
};

export type ThreadMemoryInput = {
  content: string;
  scope?: MemoryScope;
  type?: MemoryType;
  tags?: string[];
  importance?: number;
  confidence?: number;
};

export type ThreadPatchInput = {
  title?: string;
  objective?: string | null;
  archived?: boolean;
};

export type NativeOperatorApiClient = {
  getStatus(): Promise<OperatorStatus>;
  listThreads(input?: { limit?: number }): Promise<Thread[]>;
  createThread(input: {
    title?: string;
    objective?: string | null;
    modelRef?: string;
  }): Promise<Thread>;
  getThread(threadId: string): Promise<Thread>;
  patchThread(threadId: string, patch: ThreadPatchInput): Promise<Thread>;
  postMessage(threadId: string, input: { content: string }): Promise<OperatorPostMessageResponse>;
  listMessages(threadId: string, input?: { limit?: number }): Promise<ThreadMessage[]>;
  setThreadModel(threadId: string, modelRef: string): Promise<Thread>;
  listModels(): Promise<ListedProviderModel[]>;
  remember(threadId: string, input: ThreadMemoryInput): Promise<ThreadMemory>;
  searchMemories(
    threadId: string,
    input?: { query?: string; limit?: number },
  ): Promise<ThreadMemory[]>;
  forgetMemory(threadId: string, prefix: string): Promise<ThreadMemory>;
  getContext(threadId: string): Promise<OperatorThreadContext>;
  getMemoryUsed(threadId: string): Promise<ThreadMemory[]>;
  compactThread(threadId: string): Promise<OperatorCompactResponse>;
  getSummary(threadId: string): Promise<ThreadSummary | null>;
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

function routeParam(value: string): string {
  return encodeURIComponent(value);
}

export function createNativeOperatorApiClient(input: {
  apiToken?: string;
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
    if (input.apiToken) {
      headers.authorization = `Bearer ${input.apiToken}`;
    }
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
    async getStatus() {
      return await requestJson<OperatorStatus>("/health");
    },

    async listThreads({ limit } = {}) {
      const response = await requestJson<{ threads: Thread[] }>("/threads", {
        query: { limit },
      });
      return response.threads;
    },

    async createThread(thread) {
      return await requestJson<Thread>("/threads", {
        method: "POST",
        body: thread,
      });
    },

    async getThread(threadId) {
      return await requestJson<Thread>(`/threads/${routeParam(threadId)}`);
    },

    async patchThread(threadId, patch) {
      return await requestJson<Thread>(`/threads/${routeParam(threadId)}`, {
        method: "PATCH",
        body: patch,
      });
    },

    async postMessage(threadId, message) {
      return await requestJson<OperatorPostMessageResponse>(
        `/threads/${routeParam(threadId)}/messages`,
        {
          method: "POST",
          body: message,
        },
      );
    },

    async listMessages(threadId, { limit } = {}) {
      const response = await requestJson<{ messages: ThreadMessage[] }>(
        `/threads/${routeParam(threadId)}/messages`,
        {
          query: { limit },
        },
      );
      return response.messages;
    },

    async setThreadModel(threadId, modelRef) {
      return await requestJson<Thread>(`/threads/${routeParam(threadId)}/model`, {
        method: "POST",
        body: { modelRef },
      });
    },

    async listModels() {
      const response = await requestJson<{ models: ListedProviderModel[] }>("/models");
      return response.models;
    },

    async remember(threadId, memory) {
      return await requestJson<ThreadMemory>(`/threads/${routeParam(threadId)}/memories`, {
        method: "POST",
        body: memory,
      });
    },

    async searchMemories(threadId, { query, limit } = {}) {
      const response = await requestJson<{ memories: ThreadMemory[] }>(
        `/threads/${routeParam(threadId)}/memories`,
        {
          query: { query, limit },
        },
      );
      return response.memories;
    },

    async forgetMemory(threadId, prefix) {
      return await requestJson<ThreadMemory>(
        `/threads/${routeParam(threadId)}/memories/${routeParam(prefix)}/forget`,
        {
          method: "POST",
          body: {},
        },
      );
    },

    async getContext(threadId) {
      const response = await requestJson<OperatorContextResponse>(
        `/threads/${routeParam(threadId)}/context`,
      );
      return response.context;
    },

    async getMemoryUsed(threadId) {
      const response = await requestJson<{ memories: ThreadMemory[] }>(
        `/threads/${routeParam(threadId)}/memory-used`,
      );
      return response.memories;
    },

    async compactThread(threadId) {
      return await requestJson<OperatorCompactResponse>(
        `/threads/${routeParam(threadId)}/compact`,
        {
          method: "POST",
          body: {},
        },
      );
    },

    async getSummary(threadId) {
      const response = await requestJson<{ summary: ThreadSummary | null }>(
        `/threads/${routeParam(threadId)}/summary`,
      );
      return response.summary;
    },
  };
}
