import { afterEach, describe, expect, it } from "vitest";
import {
  applyLeanGatewayRuntimeProfile,
  isLeanGatewayProfileEnabled,
  isMinimalAssistantDistributionEnabled,
  isPersonalAssistantHardeningEnabled,
  PERSONAL_ASSISTANT_DEFAULT_PLUGIN_ALLOWLIST,
} from "./lean-gateway-profile.js";
import type { OpenClawConfig } from "./types.js";

describe("lean gateway profile", () => {
  const originalLean = process.env.ICLAW_LEAN_GATEWAY;
  const originalMinimal = process.env.ICLAW_MINIMAL_ASSISTANT;

  afterEach(() => {
    if (originalLean === undefined) {
      delete process.env.ICLAW_LEAN_GATEWAY;
    } else {
      process.env.ICLAW_LEAN_GATEWAY = originalLean;
    }
    if (originalMinimal === undefined) {
      delete process.env.ICLAW_MINIMAL_ASSISTANT;
    } else {
      process.env.ICLAW_MINIMAL_ASSISTANT = originalMinimal;
    }
  });

  it("is disabled unless ICLAW_LEAN_GATEWAY=1", () => {
    delete process.env.ICLAW_LEAN_GATEWAY;
    expect(isLeanGatewayProfileEnabled()).toBe(false);
    process.env.ICLAW_LEAN_GATEWAY = "1";
    expect(isLeanGatewayProfileEnabled()).toBe(true);
  });

  it("minimal assistant env is independent of lean", () => {
    delete process.env.ICLAW_LEAN_GATEWAY;
    delete process.env.ICLAW_MINIMAL_ASSISTANT;
    expect(isMinimalAssistantDistributionEnabled()).toBe(false);
    process.env.ICLAW_MINIMAL_ASSISTANT = "1";
    expect(isMinimalAssistantDistributionEnabled()).toBe(true);
    expect(isPersonalAssistantHardeningEnabled()).toBe(true);
  });

  it("returns config unchanged when no hardening env is set", () => {
    delete process.env.ICLAW_LEAN_GATEWAY;
    delete process.env.ICLAW_MINIMAL_ASSISTANT;
    const cfg = { gateway: { port: 18789 } } as OpenClawConfig;
    expect(applyLeanGatewayRuntimeProfile(cfg)).toBe(cfg);
  });

  it("sets bind loopback and ollama-only allow when lean is on and fields unset", () => {
    process.env.ICLAW_LEAN_GATEWAY = "1";
    const cfg = {} as OpenClawConfig;
    const next = applyLeanGatewayRuntimeProfile(cfg);
    expect(next.gateway?.bind).toBe("loopback");
    expect(next.plugins?.allow).toEqual([...PERSONAL_ASSISTANT_DEFAULT_PLUGIN_ALLOWLIST]);
    expect(PERSONAL_ASSISTANT_DEFAULT_PLUGIN_ALLOWLIST).toEqual(["ollama"]);
  });

  it("sets bind and allow when ICLAW_MINIMAL_ASSISTANT=1", () => {
    process.env.ICLAW_MINIMAL_ASSISTANT = "1";
    const cfg = {} as OpenClawConfig;
    const next = applyLeanGatewayRuntimeProfile(cfg);
    expect(next.gateway?.bind).toBe("loopback");
    expect(next.plugins?.allow).toEqual(["ollama"]);
  });

  it("does not override explicit bind or plugins.allow", () => {
    process.env.ICLAW_LEAN_GATEWAY = "1";
    const cfg = {
      gateway: { bind: "lan" as const },
      plugins: { allow: ["telegram"] },
    } as OpenClawConfig;
    const next = applyLeanGatewayRuntimeProfile(cfg);
    expect(next.gateway?.bind).toBe("lan");
    expect(next.plugins?.allow).toEqual(["telegram"]);
  });
});
