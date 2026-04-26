import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "../test-helpers/temp-dir.js";
import { doctorMigrateFromOpenClaw } from "./doctor-migrate-from-openclaw.js";

function mockRuntime() {
  const log = vi.fn();
  const error = vi.fn();
  const exit = vi.fn();
  return { log, error, exit };
}

describe("doctorMigrateFromOpenClaw", () => {
  it("no-ops when ~/.openclaw is missing", async () => {
    await withTempDir({ prefix: "migrate-openclaw-" }, async (root) => {
      const env = { ICLAW_HOME: root } as NodeJS.ProcessEnv;
      const rt = mockRuntime();
      await doctorMigrateFromOpenClaw(rt, { env, homedir: () => root });
      expect(rt.log).toHaveBeenCalledWith(expect.stringContaining("No legacy state directory"));
    });
  });

  it("copies legacy dir, renames openclaw.json → iclaw.json", async () => {
    await withTempDir({ prefix: "migrate-openclaw-" }, async (root) => {
      const legacy = path.join(root, ".openclaw");
      await fs.mkdir(legacy, { recursive: true });
      await fs.writeFile(path.join(legacy, "openclaw.json"), '{"x":1}', "utf-8");
      await fs.mkdir(path.join(legacy, "agents"), { recursive: true });
      await fs.writeFile(path.join(legacy, "agents", "note.txt"), "hi", "utf-8");

      const env = { ICLAW_HOME: root } as NodeJS.ProcessEnv;
      const rt = mockRuntime();
      await doctorMigrateFromOpenClaw(rt, { env, homedir: () => root });

      const target = path.join(root, ".iclaw");
      expect(await fs.readFile(path.join(target, "iclaw.json"), "utf-8")).toBe('{"x":1}');
      expect(await fs.readFile(path.join(target, "agents", "note.txt"), "utf-8")).toBe("hi");
      expect(rt.log).toHaveBeenCalledWith("Migration complete.");
    });
  });

  it("refuses when ~/.iclaw exists and is non-empty without --force", async () => {
    await withTempDir({ prefix: "migrate-openclaw-" }, async (root) => {
      const legacy = path.join(root, ".openclaw");
      await fs.mkdir(legacy, { recursive: true });
      await fs.writeFile(path.join(legacy, "openclaw.json"), "{}", "utf-8");
      const target = path.join(root, ".iclaw");
      await fs.mkdir(target, { recursive: true });
      await fs.writeFile(path.join(target, "keep.txt"), "x", "utf-8");

      const env = { ICLAW_HOME: root } as NodeJS.ProcessEnv;
      const rt = mockRuntime();
      await expect(doctorMigrateFromOpenClaw(rt, { env, homedir: () => root })).rejects.toThrow(
        /not empty/,
      );
    });
  });

  it("overwrites non-empty ~/.iclaw with --force", async () => {
    await withTempDir({ prefix: "migrate-openclaw-" }, async (root) => {
      const legacy = path.join(root, ".openclaw");
      await fs.mkdir(legacy, { recursive: true });
      await fs.writeFile(path.join(legacy, "openclaw.json"), '{"from":"legacy"}', "utf-8");

      const target = path.join(root, ".iclaw");
      await fs.mkdir(target, { recursive: true });
      await fs.writeFile(path.join(target, "stale.txt"), "old", "utf-8");

      const env = { ICLAW_HOME: root } as NodeJS.ProcessEnv;
      const rt = mockRuntime();
      await doctorMigrateFromOpenClaw(rt, { env, homedir: () => root, force: true });

      expect(await fs.readFile(path.join(target, "iclaw.json"), "utf-8")).toBe('{"from":"legacy"}');
      await expect(fs.access(path.join(target, "stale.txt"))).rejects.toBeDefined();
    });
  });
});
