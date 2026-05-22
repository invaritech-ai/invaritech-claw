import type { DatabaseSync } from "node:sqlite";
import {
  deleteStateValue,
  getStateValue,
  listStateNamespace,
  setStateValue,
} from "../storage/state.js";

function serializeJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? "null" : serialized;
}

function deserializeJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

export type StateTools = ReturnType<typeof createStateTools>;

export function createStateTools(db: DatabaseSync) {
  return {
    set(namespace: string, key: string, value: unknown): void {
      const now = Date.now();
      const existing = getStateValue(db, namespace, key);
      setStateValue(db, {
        namespace,
        key,
        valueJson: serializeJson(value),
        createdAtMs: existing?.createdAtMs ?? now,
        updatedAtMs: now,
      });
    },

    get(namespace: string, key: string): unknown | undefined {
      const row = getStateValue(db, namespace, key);
      return row ? deserializeJson(row.valueJson) : undefined;
    },

    list(namespace: string): Array<{ key: string; value: unknown }> {
      return listStateNamespace(db, namespace).map((entry) => ({
        key: entry.key,
        value: deserializeJson(entry.valueJson),
      }));
    },

    delete(namespace: string, key: string): void {
      deleteStateValue(db, namespace, key);
    },
  };
}
