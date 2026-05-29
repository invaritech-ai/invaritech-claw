import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { isRunConflictError } from "../runs/service.js";
import type { RunService } from "../runs/service.js";
import type { Run } from "../runs/types.js";
import type { WebhookDeliveryRecord, WebhookRecord } from "../storage/schema.js";
import {
  getWebhookById,
  getWebhookDeliveryByIdempotencyKey,
  insertWebhookDelivery,
  listWebhooks,
  upsertWebhook,
} from "../storage/webhooks.js";
import type {
  Webhook,
  WebhookConfig,
  WebhookDeliveryRequest,
  WebhookDeliveryResult,
} from "./types.js";

const DEFAULT_IDEMPOTENCY_HEADER = "x-idempotency-key";
const SECRET_HEADER = "x-iclaw-webhook-secret";
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  SECRET_HEADER,
]);

function serializeJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? "null" : serialized;
}

function deserializeJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const expected = normalizeHeaderName(name);
  for (const [key, value] of Object.entries(headers)) {
    if (normalizeHeaderName(key) !== expected) {
      continue;
    }
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }
  return undefined;
}

function redactHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_HEADERS.has(normalizeHeaderName(key)) ? "[redacted]" : value,
    ]),
  );
}

function buildDeliveryRecord(input: {
  webhook: Webhook;
  idempotencyKey: string | null;
  run: Run;
  request: WebhookDeliveryRequest;
  nowMs: number;
}): WebhookDeliveryRecord {
  return {
    id: crypto.randomUUID(),
    webhookId: input.webhook.id,
    idempotencyKey: input.idempotencyKey,
    runId: input.run.id,
    requestJson: serializeJson({
      headers: redactHeaders(input.request.headers),
      body: input.request.body,
    }),
    responseJson: serializeJson({ runId: input.run.id }),
    status: "accepted",
    createdAtMs: input.nowMs,
  };
}

function secretsMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function mapWebhookRecord(record: WebhookRecord): Webhook {
  return {
    id: record.id,
    path: record.path,
    agentId: record.agentId,
    config: deserializeJson(record.configJson) as WebhookConfig,
    createdAtMs: record.createdAtMs,
    updatedAtMs: record.updatedAtMs,
  };
}

export class WebhookAuthError extends Error {
  constructor() {
    super("webhook secret is missing or invalid");
    this.name = "WebhookAuthError";
  }
}

export type WebhookService = ReturnType<typeof createWebhookService>;

export function isWebhookAuthError(error: unknown): error is WebhookAuthError {
  return error instanceof WebhookAuthError;
}

export function createWebhookService(input: { db: DatabaseSync; runService: RunService }) {
  return {
    registerWebhook(webhook: {
      id: string;
      path?: string;
      agentId: string;
      config?: WebhookConfig;
      nowMs?: number;
    }): Webhook {
      const nowMs = webhook.nowMs ?? Date.now();
      const existing = getWebhookById(input.db, webhook.id);
      const record: WebhookRecord = {
        id: webhook.id,
        path: webhook.path ?? `/webhooks/${webhook.id}`,
        agentId: webhook.agentId,
        configJson: serializeJson(webhook.config ?? {}),
        createdAtMs: existing?.createdAtMs ?? nowMs,
        updatedAtMs: nowMs,
      };
      upsertWebhook(input.db, record);
      return mapWebhookRecord(record);
    },

    getWebhook(webhookId: string): Webhook | undefined {
      const record = getWebhookById(input.db, webhookId);
      return record ? mapWebhookRecord(record) : undefined;
    },

    listWebhooks(limit = 100): Webhook[] {
      return listWebhooks(input.db, limit).map(mapWebhookRecord);
    },

    deliver(request: WebhookDeliveryRequest): WebhookDeliveryResult | undefined {
      const record = getWebhookById(input.db, request.webhookId);
      if (!record) {
        return undefined;
      }
      const webhook = mapWebhookRecord(record);
      const webhookSecret = webhook.config.secret?.trim();
      const providedSecret = readHeader(request.headers, SECRET_HEADER);
      if (!webhookSecret || !providedSecret || !secretsMatch(providedSecret, webhookSecret)) {
        throw new WebhookAuthError();
      }

      const idempotencyHeader = webhook.config.idempotencyHeader ?? DEFAULT_IDEMPOTENCY_HEADER;
      const idempotencyKey = readHeader(request.headers, idempotencyHeader)?.trim() || null;
      const nowMs = request.nowMs ?? Date.now();
      if (idempotencyKey) {
        const existingDelivery = getWebhookDeliveryByIdempotencyKey(
          input.db,
          webhook.id,
          idempotencyKey,
        );
        if (existingDelivery?.runId) {
          const existingRun = input.runService.getRun(existingDelivery.runId);
          if (existingRun) {
            return {
              webhook,
              run: existingRun,
              deliveryId: existingDelivery.id,
              duplicate: true,
            };
          }
        }
      }

      let run: Run;
      try {
        run = input.runService.createRun({
          agentId: webhook.agentId,
          triggerType: "webhook",
          triggerId: webhook.id,
          idempotencyKey,
          input: {
            webhookId: webhook.id,
            body: request.body,
          },
          createdAtMs: nowMs,
        });
      } catch (error) {
        if (
          idempotencyKey &&
          isRunConflictError(error) &&
          error.reason === "duplicate_idempotency"
        ) {
          const existingRun = input.runService.getRunByTriggerIdempotencyKey({
            triggerType: "webhook",
            triggerId: webhook.id,
            idempotencyKey,
          });
          if (existingRun) {
            const existingDelivery = getWebhookDeliveryByIdempotencyKey(
              input.db,
              webhook.id,
              idempotencyKey,
            );
            if (existingDelivery) {
              return {
                webhook,
                run: existingRun,
                deliveryId: existingDelivery.id,
                duplicate: true,
              };
            }
            const delivery = buildDeliveryRecord({
              webhook,
              idempotencyKey,
              run: existingRun,
              request,
              nowMs,
            });
            insertWebhookDelivery(input.db, delivery);
            return {
              webhook,
              run: existingRun,
              deliveryId: delivery.id,
              duplicate: true,
            };
          }
        }
        throw error;
      }
      input.runService.appendEvent(run.id, {
        type: "run.queued",
        payload: { webhookId: webhook.id },
        createdAtMs: nowMs,
      });

      const delivery = buildDeliveryRecord({
        webhook,
        idempotencyKey,
        run,
        request,
        nowMs,
      });
      insertWebhookDelivery(input.db, delivery);

      return {
        webhook,
        run,
        deliveryId: delivery.id,
        duplicate: false,
      };
    },
  };
}
