import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openIclawDatabase } from "../../src/storage/sqlite.js";

describe("openIclawDatabase", () => {
  it("creates the v1 sqlite tables", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "iclaw-storage-sqlite-test-"));
    const dbPath = path.join(tempDir, "state.sqlite");

    try {
      const db = openIclawDatabase(dbPath);
      const rows = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>;
      const tableNames = new Set(
        rows.map((row) => row.name).filter((name) => name !== "sqlite_sequence"),
      );

      expect(tableNames).toEqual(new Set(["schema_migrations", "runs", "run_events"]));

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
