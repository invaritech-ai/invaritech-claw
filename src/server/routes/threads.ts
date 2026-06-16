import type { Express, NextFunction, Request, Response } from "express";
import { resolveProviderForModel, type ProviderRegistry } from "../../agent/model.js";
import type { IclawConfig } from "../../config/types.js";
import type { MemoryScope, MemoryType } from "../../storage/schema.js";
import { compactThread } from "../../threads/compact.js";
import { buildThreadContext } from "../../threads/context.js";
import {
  AmbiguousMemoryIdError,
  MemoryNotFoundError,
  ThreadNotFoundError,
  type ThreadService,
} from "../../threads/service.js";
import { listConfiguredModels } from "../providers.js";

type ThreadRouteServices = {
  config: IclawConfig;
  providers: ProviderRegistry;
  threadService: ThreadService;
};

type ModelRefValidationResult =
  | { ok: true; modelRef: string | null }
  | { ok: false; status: 400; body: { error: string; message?: string } };

const MEMORY_TYPES: ReadonlySet<MemoryType> = new Set([
  "fact",
  "preference",
  "decision",
  "constraint",
  "principle",
  "milestone",
]);

const MEMORY_SCOPES: ReadonlySet<MemoryScope> = new Set(["thread", "global"]);

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function asOptionalString(value: unknown): string | null {
  if (!isString(value)) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRouteParam(value: unknown): string {
  if (Array.isArray(value)) {
    return asOptionalString(value[0]) ?? "";
  }
  return asOptionalString(value) ?? "";
}

function asLimit(value: unknown): number | undefined {
  const text = asOptionalString(value);
  if (!text) {
    return undefined;
  }
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isMemoryType(value: unknown): value is MemoryType {
  return isString(value) && MEMORY_TYPES.has(value as MemoryType);
}

function isMemoryScope(value: unknown): value is MemoryScope {
  return isString(value) && MEMORY_SCOPES.has(value as MemoryScope);
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const tags = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return tags;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function validateRouteModelRef(input: {
  value: unknown;
  providers: ProviderRegistry;
  required: boolean;
}): ModelRefValidationResult {
  const modelRef = asOptionalString(input.value);
  if (!modelRef) {
    if (input.required) {
      return { ok: false, status: 400, body: { error: "modelRef is required" } };
    }
    return { ok: true, modelRef: null };
  }

  try {
    resolveProviderForModel(modelRef, input.providers);
    return { ok: true, modelRef };
  } catch (error) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid modelRef",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function latestUserMessageId(service: ThreadService, threadId: string): string | null {
  const messages = service.listMessages(threadId, 1000);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role === "user") {
      return message.id;
    }
  }
  return null;
}

function handleKnownError(error: unknown, res: Response): boolean {
  if (error instanceof ThreadNotFoundError) {
    res.status(404).json({ error: "thread not found" });
    return true;
  }
  if (error instanceof MemoryNotFoundError) {
    res.status(404).json({ error: "memory not found" });
    return true;
  }
  if (error instanceof AmbiguousMemoryIdError) {
    res.status(409).json({ error: "memory id is ambiguous" });
    return true;
  }
  return false;
}

function getRouteThreadOr404(service: ThreadService, threadId: string, res: Response): boolean {
  if (service.getThread(threadId)) {
    return true;
  }
  res.status(404).json({ error: "thread not found" });
  return false;
}

function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch((error: unknown) => {
      if (handleKnownError(error, res)) {
        return;
      }
      next(error);
    });
  };
}

export function attachThreadRoutes(app: Express, services: ThreadRouteServices): void {
  const { config, providers, threadService } = services;
  const activeMessageThreads = new Set<string>();

  app.get("/threads", (req, res) => {
    res.json({ threads: threadService.listThreads({ limit: asLimit(req.query.limit) }) });
  });

  app.post("/threads", (req, res) => {
    const body = (req.body ?? {}) as {
      title?: unknown;
      objective?: unknown;
      modelRef?: unknown;
    };
    const effectiveModelRef = asOptionalString(body.modelRef) ?? config.models.chat;
    const modelRef = validateRouteModelRef({
      value: effectiveModelRef,
      providers,
      required: true,
    });
    if (!modelRef.ok) {
      res.status(modelRef.status).json(modelRef.body);
      return;
    }
    const thread = threadService.createThread({
      title: asOptionalString(body.title) ?? undefined,
      objective: body.objective === null ? null : asOptionalString(body.objective),
      modelRef: modelRef.modelRef ?? undefined,
    });
    res.status(201).json(thread);
  });

  app.get("/threads/:id", (req, res) => {
    const threadId = asRouteParam(req.params.id);
    const thread = threadService.getThread(threadId);
    if (!thread) {
      res.status(404).json({ error: "thread not found" });
      return;
    }
    res.json(thread);
  });

  app.patch("/threads/:id", (req, res) => {
    const body = (req.body ?? {}) as {
      title?: unknown;
      objective?: unknown;
      archived?: unknown;
    };
    const threadId = asRouteParam(req.params.id);
    try {
      if (body.archived === true) {
        res.json(threadService.archiveThread(threadId));
        return;
      }

      let thread = threadService.getThread(threadId);
      if (!thread) {
        res.status(404).json({ error: "thread not found" });
        return;
      }
      const title = asOptionalString(body.title);
      if (title) {
        thread = threadService.renameThread(threadId, title);
      }
      if (body.objective !== undefined) {
        thread = threadService.setObjective(
          threadId,
          body.objective === null ? null : asOptionalString(body.objective),
        );
      }
      res.json(thread);
    } catch (error) {
      if (handleKnownError(error, res)) {
        return;
      }
      throw error;
    }
  });

  app.post(
    "/threads/:id/messages",
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as { content?: unknown };
      const content = asOptionalString(body.content);
      if (!content) {
        res.status(400).json({ error: "content is required" });
        return;
      }

      const threadId = asRouteParam(req.params.id);
      const thread = threadService.getThread(threadId);
      if (!thread) {
        res.status(404).json({ error: "thread not found" });
        return;
      }

      if (activeMessageThreads.has(thread.id)) {
        res.status(409).json({ error: "thread message request already in progress" });
        return;
      }

      activeMessageThreads.add(thread.id);
      try {
        const userMessage = threadService.appendUserMessage(thread.id, content);
        const context = buildThreadContext({
          service: threadService,
          threadId: thread.id,
          currentUserMessageId: userMessage.id,
          config,
        });
        const invocation = threadService.recordInvocation({
          threadId: thread.id,
          userMessageId: userMessage.id,
          modelRef: thread.activeModelRef,
          kind: "chat",
        });

        try {
          const { provider, model } = resolveProviderForModel(thread.activeModelRef, providers);
          const result = await provider.complete({ model, messages: context.messages });
          const assistantMessage = threadService.appendAssistantMessage(thread.id, {
            content: result.text,
            modelRef: thread.activeModelRef,
          });
          threadService.finishInvocation({
            invocationId: invocation.id,
            status: "succeeded",
            assistantMessageId: assistantMessage.id,
          });
          threadService.recordInvocationMemories(
            invocation.id,
            context.usedMemories.map((memory) => ({ memoryId: memory.id })),
          );
          res.status(201).json({
            message: assistantMessage,
            invocationId: invocation.id,
            context: {
              tokenEstimate: context.tokenEstimate,
              sections: context.sections,
              usedMemories: context.usedMemories,
            },
          });
        } catch (error) {
          threadService.finishInvocation({
            invocationId: invocation.id,
            status: "failed",
            error: error instanceof Error ? { message: error.message } : { message: String(error) },
          });
          throw error;
        }
      } finally {
        activeMessageThreads.delete(thread.id);
      }
    }),
  );

  app.get("/threads/:id/messages", (req, res) => {
    const threadId = asRouteParam(req.params.id);
    try {
      res.json({
        messages: threadService.listMessages(threadId, asLimit(req.query.limit) ?? 100),
      });
    } catch (error) {
      if (handleKnownError(error, res)) {
        return;
      }
      throw error;
    }
  });

  app.post("/threads/:id/model", (req, res) => {
    const body = (req.body ?? {}) as { modelRef?: unknown };
    const modelRef = validateRouteModelRef({
      value: body.modelRef,
      providers,
      required: true,
    });
    if (!modelRef.ok) {
      res.status(modelRef.status).json(modelRef.body);
      return;
    }
    const nextModelRef = modelRef.modelRef;
    if (!nextModelRef) {
      res.status(400).json({ error: "modelRef is required" });
      return;
    }
    const threadId = asRouteParam(req.params.id);
    try {
      res.json(threadService.setThreadModel(threadId, nextModelRef));
    } catch (error) {
      if (handleKnownError(error, res)) {
        return;
      }
      throw error;
    }
  });

  app.get(
    "/models",
    asyncRoute(async (_req, res) => {
      res.json({ models: await listConfiguredModels({ providers, config }) });
    }),
  );

  app.post("/threads/:id/memories", (req, res) => {
    const body = (req.body ?? {}) as {
      scope?: unknown;
      type?: unknown;
      content?: unknown;
      tags?: unknown;
      importance?: unknown;
      confidence?: unknown;
    };
    const content = asOptionalString(body.content);
    if (!content) {
      res.status(400).json({ error: "content is required" });
      return;
    }
    const scope = body.scope === undefined ? "thread" : body.scope;
    if (!isMemoryScope(scope)) {
      res.status(400).json({ error: "invalid memory scope" });
      return;
    }
    if (body.type !== undefined && !isMemoryType(body.type)) {
      res.status(400).json({ error: "invalid memory type" });
      return;
    }

    const threadId = asRouteParam(req.params.id);
    if (!getRouteThreadOr404(threadService, threadId, res)) {
      return;
    }
    try {
      const memory = threadService.remember({
        scope,
        threadId: scope === "thread" ? threadId : null,
        type: isMemoryType(body.type) ? body.type : undefined,
        content,
        tags: asStringArray(body.tags),
        importance: asNumber(body.importance),
        confidence: asNumber(body.confidence),
      });
      res.status(201).json(memory);
    } catch (error) {
      if (handleKnownError(error, res)) {
        return;
      }
      throw error;
    }
  });

  app.get("/threads/:id/memories", (req, res) => {
    const threadId = asRouteParam(req.params.id);
    if (!getRouteThreadOr404(threadService, threadId, res)) {
      return;
    }
    const query = asOptionalString(req.query.query ?? req.query.q);
    if (!query) {
      res.json({ memories: [] });
      return;
    }
    try {
      res.json({
        memories: threadService.searchMemories({
          query,
          scope: "thread_and_global",
          threadId,
          limit: asLimit(req.query.limit) ?? 20,
        }),
      });
    } catch (error) {
      if (handleKnownError(error, res)) {
        return;
      }
      throw error;
    }
  });

  app.post("/threads/:id/memories/:memoryIdPrefix/forget", (req, res) => {
    const threadId = asRouteParam(req.params.id);
    const memoryIdPrefix = asRouteParam(req.params.memoryIdPrefix);
    if (!getRouteThreadOr404(threadService, threadId, res)) {
      return;
    }
    try {
      res.json(threadService.forgetMemory(memoryIdPrefix, threadId));
    } catch (error) {
      if (handleKnownError(error, res)) {
        return;
      }
      throw error;
    }
  });

  app.get("/threads/:id/context", (req, res) => {
    const threadId = asRouteParam(req.params.id);
    try {
      const currentUserMessageId = latestUserMessageId(threadService, threadId);
      if (!currentUserMessageId) {
        res.status(404).json({ error: "thread has no user messages" });
        return;
      }
      const context = buildThreadContext({
        service: threadService,
        threadId,
        currentUserMessageId,
        config,
      });
      res.json({ context });
    } catch (error) {
      if (handleKnownError(error, res)) {
        return;
      }
      throw error;
    }
  });

  app.get("/threads/:id/memory-used", (req, res) => {
    const threadId = asRouteParam(req.params.id);
    try {
      res.json({
        memories: threadService
          .listLatestThreadInvocationMemories(threadId)
          .map((item) => item.memory),
      });
    } catch (error) {
      if (handleKnownError(error, res)) {
        return;
      }
      throw error;
    }
  });

  app.post(
    "/threads/:id/compact",
    asyncRoute(async (req, res) => {
      const threadId = asRouteParam(req.params.id);
      const result = await compactThread({ threadId, config, providers, service: threadService });
      res.status(201).json(result);
    }),
  );

  app.get("/threads/:id/summary", (req, res) => {
    const threadId = asRouteParam(req.params.id);
    try {
      res.json({ summary: threadService.getLatestSummary(threadId) ?? null });
    } catch (error) {
      if (handleKnownError(error, res)) {
        return;
      }
      throw error;
    }
  });
}
