import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs(["node", "iclaw", "gateway", "--dev", "--allow-unconfigured"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "iclaw", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("leaves gateway --dev for subcommands after leading root options", () => {
    const res = parseCliProfileArgs([
      "node",
      "iclaw",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "iclaw",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "iclaw", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "iclaw", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "iclaw", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "iclaw", "status"]);
  });

  it("parses interleaved --profile after the command token", () => {
    const res = parseCliProfileArgs(["node", "iclaw", "status", "--profile", "work", "--deep"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "iclaw", "status", "--deep"]);
  });

  it("parses interleaved --dev after the command token", () => {
    const res = parseCliProfileArgs(["node", "iclaw", "status", "--dev"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "iclaw", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "iclaw", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it.each([
    ["--dev first", ["node", "iclaw", "--dev", "--profile", "work", "status"]],
    ["--profile first", ["node", "iclaw", "--profile", "work", "--dev", "status"]],
    ["interleaved after command", ["node", "iclaw", "status", "--profile", "work", "--dev"]],
  ])("rejects combining --dev with --profile (%s)", (_name, argv) => {
    const res = parseCliProfileArgs(argv);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".iclaw-dev");
    expect(env.ICLAW_PROFILE).toBe("dev");
    expect(env.ICLAW_STATE_DIR).toBe(expectedStateDir);
    expect(env.ICLAW_CONFIG_PATH).toBe(path.join(expectedStateDir, "iclaw.json"));
    expect(env.ICLAW_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      ICLAW_STATE_DIR: "/custom",
      ICLAW_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.ICLAW_STATE_DIR).toBe("/custom");
    expect(env.ICLAW_GATEWAY_PORT).toBe("19099");
    expect(env.ICLAW_CONFIG_PATH).toBe(path.join("/custom", "iclaw.json"));
  });

  it("uses ICLAW_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      ICLAW_HOME: "/srv/iclaw-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/iclaw-home");
    expect(env.ICLAW_STATE_DIR).toBe(path.join(resolvedHome, ".iclaw-work"));
    expect(env.ICLAW_CONFIG_PATH).toBe(path.join(resolvedHome, ".iclaw-work", "iclaw.json"));
  });
});

describe("formatCliCommand", () => {
  it.each([
    {
      name: "no profile is set",
      cmd: "iclaw doctor --fix",
      env: {},
      expected: "iclaw doctor --fix",
    },
    {
      name: "profile is default",
      cmd: "iclaw doctor --fix",
      env: { ICLAW_PROFILE: "default" },
      expected: "iclaw doctor --fix",
    },
    {
      name: "profile is Default (case-insensitive)",
      cmd: "iclaw doctor --fix",
      env: { ICLAW_PROFILE: "Default" },
      expected: "iclaw doctor --fix",
    },
    {
      name: "profile is invalid",
      cmd: "iclaw doctor --fix",
      env: { ICLAW_PROFILE: "bad profile" },
      expected: "iclaw doctor --fix",
    },
    {
      name: "--profile is already present",
      cmd: "iclaw --profile work doctor --fix",
      env: { ICLAW_PROFILE: "work" },
      expected: "iclaw --profile work doctor --fix",
    },
    {
      name: "--dev is already present",
      cmd: "iclaw --dev doctor",
      env: { ICLAW_PROFILE: "dev" },
      expected: "iclaw --dev doctor",
    },
  ])("returns command unchanged when $name", ({ cmd, env, expected }) => {
    expect(formatCliCommand(cmd, env)).toBe(expected);
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("iclaw doctor --fix", { ICLAW_PROFILE: "work" })).toBe(
      "iclaw --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("iclaw doctor --fix", { ICLAW_PROFILE: "  jbopenclaw  " })).toBe(
      "iclaw --profile jbopenclaw doctor --fix",
    );
  });

  it("handles command with no args after iclaw", () => {
    expect(formatCliCommand("iclaw", { ICLAW_PROFILE: "test" })).toBe("iclaw --profile test");
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm iclaw doctor", { ICLAW_PROFILE: "work" })).toBe(
      "pnpm iclaw --profile work doctor",
    );
  });

  it("inserts --container when a container hint is set", () => {
    expect(formatCliCommand("iclaw gateway status --deep", { ICLAW_CONTAINER_HINT: "demo" })).toBe(
      "iclaw --container demo gateway status --deep",
    );
  });

  it("ignores unsafe container hints", () => {
    expect(
      formatCliCommand("iclaw gateway status --deep", {
        ICLAW_CONTAINER_HINT: "demo; rm -rf /",
      }),
    ).toBe("iclaw gateway status --deep");
  });

  it("preserves both --container and --profile hints", () => {
    expect(
      formatCliCommand("iclaw doctor", {
        ICLAW_CONTAINER_HINT: "demo",
        ICLAW_PROFILE: "work",
      }),
    ).toBe("iclaw --container demo doctor");
  });

  it("does not prepend --container for update commands", () => {
    expect(formatCliCommand("iclaw update", { ICLAW_CONTAINER_HINT: "demo" })).toBe("iclaw update");
    expect(
      formatCliCommand("pnpm iclaw update --channel beta", { ICLAW_CONTAINER_HINT: "demo" }),
    ).toBe("pnpm iclaw update --channel beta");
  });
});
