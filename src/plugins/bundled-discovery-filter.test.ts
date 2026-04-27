import { afterEach, describe, expect, it } from "vitest";
import {
  bundledStockAllowlistCacheKeyComponent,
  resolveBundledStockDirectoryAllowlist,
  shouldSkipBundledStockDirectory,
} from "./bundled-discovery-filter.js";

describe("bundled-discovery-filter", () => {
  const originalDirs = process.env.ICLAW_BUNDLED_PLUGIN_DIRS;
  const originalMinimal = process.env.ICLAW_MINIMAL_ASSISTANT;

  afterEach(() => {
    if (originalDirs === undefined) {
      delete process.env.ICLAW_BUNDLED_PLUGIN_DIRS;
    } else {
      process.env.ICLAW_BUNDLED_PLUGIN_DIRS = originalDirs;
    }
    if (originalMinimal === undefined) {
      delete process.env.ICLAW_MINIMAL_ASSISTANT;
    } else {
      process.env.ICLAW_MINIMAL_ASSISTANT = originalMinimal;
    }
  });

  it("returns null when no filter env is set", () => {
    delete process.env.ICLAW_BUNDLED_PLUGIN_DIRS;
    delete process.env.ICLAW_MINIMAL_ASSISTANT;
    expect(resolveBundledStockDirectoryAllowlist()).toBeNull();
  });

  it("parses ICLAW_BUNDLED_PLUGIN_DIRS", () => {
    process.env.ICLAW_BUNDLED_PLUGIN_DIRS = "Ollama, memory-core";
    expect(resolveBundledStockDirectoryAllowlist()).toEqual(new Set(["ollama", "memory-core"]));
  });

  it("uses ollama-only set for ICLAW_MINIMAL_ASSISTANT=1", () => {
    process.env.ICLAW_MINIMAL_ASSISTANT = "1";
    expect(resolveBundledStockDirectoryAllowlist()).toEqual(new Set(["ollama"]));
  });

  it("shouldSkipBundledStockDirectory respects allowlist only at stock root", () => {
    process.env.ICLAW_MINIMAL_ASSISTANT = "1";
    expect(
      shouldSkipBundledStockDirectory({
        dirName: "discord",
        applyBundledStockAllowlist: true,
        env: process.env,
      }),
    ).toBe(true);
    expect(
      shouldSkipBundledStockDirectory({
        dirName: "ollama",
        applyBundledStockAllowlist: true,
        env: process.env,
      }),
    ).toBe(false);
    expect(
      shouldSkipBundledStockDirectory({
        dirName: "discord",
        applyBundledStockAllowlist: false,
        env: process.env,
      }),
    ).toBe(false);
  });

  it("bundledStockAllowlistCacheKeyComponent tracks env", () => {
    delete process.env.ICLAW_BUNDLED_PLUGIN_DIRS;
    delete process.env.ICLAW_MINIMAL_ASSISTANT;
    expect(bundledStockAllowlistCacheKeyComponent(process.env)).toBe("all");
    process.env.ICLAW_MINIMAL_ASSISTANT = "1";
    expect(bundledStockAllowlistCacheKeyComponent(process.env)).toBe("minimal:ollama");
    process.env.ICLAW_BUNDLED_PLUGIN_DIRS = "a,b";
    expect(bundledStockAllowlistCacheKeyComponent(process.env)).toBe("dirs:a,b");
  });
});
