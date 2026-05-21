import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrations.js";

export function openIclawDatabase(dbPath: string): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("PRAGMA busy_timeout=1000");

  runMigrations(db);
  return db;
}
