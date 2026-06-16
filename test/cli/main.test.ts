import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../../src/cli/main.js";

let tempDir = "";
let configPath = "";
let writeSpy: ReturnType<typeof vi.spyOn>;
let envSnapshot: Map<string, string | undefined>;

const LOOPBACK_FETCH_ENV = {
  HTTP_PROXY: undefined,
  HTTPS_PROXY: undefined,
  ALL_PROXY: undefined,
  http_proxy: undefined,
  https_proxy: undefined,
  all_proxy: undefined,
  NO_PROXY: "127.0.0.1,localhost",
  no_proxy: "127.0.0.1,localhost",
} as const;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "iclaw-cli-main-test-"));
  configPath = path.join(tempDir, "iclaw.json");
  writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  envSnapshot = new Map<string, string | undefined>();
  for (const key of Object.keys(LOOPBACK_FETCH_ENV)) {
    envSnapshot.set(key, process.env[key]);
  }
  for (const [key, value] of Object.entries(LOOPBACK_FETCH_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

afterEach(() => {
  writeSpy.mockRestore();
  for (const [key, value] of envSnapshot) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe("iclaw cli", () => {
  it("starts an embedded local server for tui when base-url is omitted", async () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        providers: {},
        server: { host: "0.0.0.0", port: 32768 },
        storage: { sqlitePath: path.join(tempDir, "state.sqlite") },
      }),
    );

    await runCli(["node", "iclaw", "tui", "--view", "status", "--config", configPath]);

    const calls = writeSpy.mock.calls as Array<[unknown, ...unknown[]]>;
    const output = calls.map((call) => String(call[0])).join("");
    const status = JSON.parse(output) as { title: string; ok: boolean; lines: string[] };
    expect(status).toMatchObject({
      title: "Status",
      ok: true,
    });
    expect(status.lines).toContain(`db ${path.join(tempDir, "state.sqlite")}`);
  });
});
