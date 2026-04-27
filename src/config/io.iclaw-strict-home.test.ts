import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../test-helpers/temp-dir.js";
import { createConfigIO } from "./io.js";

describe("ICLAW_STRICT_HOME config loading", () => {
  it("loadConfig throws when strict and canonical config is missing", async () => {
    await withTempDir({ prefix: "iclaw-strict-io-" }, async (root) => {
      const env = {
        ICLAW_STRICT_HOME: "1",
        ICLAW_HOME: root,
        ICLAW_CONFIG_PATH: undefined,
        ICLAW_STATE_DIR: undefined,
      } as NodeJS.ProcessEnv;
      const io = createConfigIO({ env, homedir: () => root });
      expect(io.configPath).toBe(path.join(root, ".iclaw", "iclaw.json"));
      expect(() => io.loadConfig()).toThrow(/ICLAW_STRICT_HOME/);
    });
  });

  it("readBestEffortConfig throws when strict and canonical config is missing", async () => {
    await withTempDir({ prefix: "iclaw-strict-io-be-" }, async (root) => {
      const env = {
        ICLAW_STRICT_HOME: "true",
        ICLAW_HOME: root,
      } as NodeJS.ProcessEnv;
      const io = createConfigIO({ env, homedir: () => root });
      await expect(io.readBestEffortConfig()).rejects.toThrow(/ICLAW_STRICT_HOME/);
    });
  });

  it("loadConfig succeeds when strict and config file exists", async () => {
    await withTempDir({ prefix: "iclaw-strict-io-ok-" }, async (root) => {
      const iclawDir = path.join(root, ".iclaw");
      await fs.mkdir(iclawDir, { recursive: true });
      const configPath = path.join(iclawDir, "iclaw.json");
      await fs.writeFile(configPath, "{}", "utf-8");
      const env = {
        ICLAW_STRICT_HOME: "1",
        ICLAW_HOME: root,
      } as NodeJS.ProcessEnv;
      const io = createConfigIO({ env, homedir: () => root });
      expect(() => io.loadConfig()).not.toThrow();
    });
  });
});
