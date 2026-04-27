import { beforeEach, describe, expect, it, vi } from "vitest";

type DiscoverOpenClawPlugins = typeof import("./discovery.js").discoverOpenClawPlugins;
type LoadPluginManifest = typeof import("./manifest.js").loadPluginManifest;
type ResolveManifestProviderAuthChoices =
  typeof import("./provider-auth-choices.js").resolveManifestProviderAuthChoices;

const discoverOpenClawPlugins = vi.hoisted(() =>
  vi.fn<DiscoverOpenClawPlugins>(() => ({ candidates: [], diagnostics: [] })),
);
vi.mock("./discovery.js", () => ({
  discoverOpenClawPlugins,
}));

const loadPluginManifest = vi.hoisted(() => vi.fn<LoadPluginManifest>());
vi.mock("./manifest.js", async () => {
  const actual = await vi.importActual<typeof import("./manifest.js")>("./manifest.js");
  return {
    ...actual,
    loadPluginManifest,
  };
});

const resolveManifestProviderAuthChoices = vi.hoisted(() =>
  vi.fn<ResolveManifestProviderAuthChoices>(() => []),
);
vi.mock("./provider-auth-choices.js", () => ({
  resolveManifestProviderAuthChoices,
}));

import {
  resolveProviderInstallCatalogEntries,
  resolveProviderInstallCatalogEntry,
} from "./provider-install-catalog.js";

describe("provider install catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    discoverOpenClawPlugins.mockReturnValue({
      candidates: [],
      diagnostics: [],
    });
    resolveManifestProviderAuthChoices.mockReturnValue([]);
  });

  it("merges manifest auth-choice metadata with discovery install metadata", () => {
    discoverOpenClawPlugins.mockReturnValue({
      candidates: [
        {
          idHint: "openrouter",
          origin: "bundled",
          rootDir: "/repo/extensions/openrouter",
          source: "/repo/extensions/openrouter/index.ts",
          workspaceDir: "/repo",
          packageName: "@openclaw/openrouter-provider",
          packageDir: "/repo/extensions/openrouter",
          packageManifest: {
            install: {
              npmSpec: "@openclaw/openrouter-provider@1.2.3",
              defaultChoice: "npm",
              expectedIntegrity: "sha512-openrouter",
            },
          },
        },
      ],
      diagnostics: [],
    });
    loadPluginManifest.mockReturnValue({
      ok: true,
      manifestPath: "/repo/extensions/openrouter/openclaw.plugin.json",
      manifest: {
        id: "openrouter",
        configSchema: {
          type: "object",
        },
      },
    });
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "openrouter",
        providerId: "openrouter",
        methodId: "api-key",
        choiceId: "openrouter-api-key",
        choiceLabel: "OpenRouter API key",
        groupId: "openrouter",
        groupLabel: "OpenRouter",
      },
    ]);

    expect(resolveProviderInstallCatalogEntries()).toEqual([
      {
        pluginId: "openrouter",
        providerId: "openrouter",
        methodId: "api-key",
        choiceId: "openrouter-api-key",
        choiceLabel: "OpenRouter API key",
        groupId: "openrouter",
        groupLabel: "OpenRouter",
        label: "OpenRouter",
        origin: "bundled",
        install: {
          npmSpec: "@openclaw/openrouter-provider@1.2.3",
          localPath: "extensions/openrouter",
          defaultChoice: "npm",
          expectedIntegrity: "sha512-openrouter",
        },
        installSource: {
          defaultChoice: "npm",
          npm: {
            spec: "@openclaw/openrouter-provider@1.2.3",
            packageName: "@openclaw/openrouter-provider",
            selector: "1.2.3",
            selectorKind: "exact-version",
            exactVersion: true,
            expectedIntegrity: "sha512-openrouter",
            pinState: "exact-with-integrity",
          },
          local: {
            path: "extensions/openrouter",
          },
          warnings: [],
        },
      },
    ]);
  });

  it("falls back to workspace-relative local path when install metadata is sparse", () => {
    discoverOpenClawPlugins.mockReturnValue({
      candidates: [
        {
          idHint: "demo-provider",
          origin: "workspace",
          rootDir: "/repo/extensions/demo-provider",
          source: "/repo/extensions/demo-provider/index.ts",
          workspaceDir: "/repo",
          packageName: "@vendor/demo-provider",
          packageDir: "/repo/extensions/demo-provider",
          packageManifest: {},
        },
      ],
      diagnostics: [],
    });
    loadPluginManifest.mockReturnValue({
      ok: true,
      manifestPath: "/repo/extensions/demo-provider/openclaw.plugin.json",
      manifest: {
        id: "demo-provider",
        configSchema: {
          type: "object",
        },
      },
    });
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "demo-provider",
        providerId: "demo-provider",
        methodId: "api-key",
        choiceId: "demo-provider-api-key",
        choiceLabel: "Demo Provider API key",
      },
    ]);

    expect(resolveProviderInstallCatalogEntries()).toEqual([
      {
        pluginId: "demo-provider",
        providerId: "demo-provider",
        methodId: "api-key",
        choiceId: "demo-provider-api-key",
        choiceLabel: "Demo Provider API key",
        label: "Demo Provider API key",
        origin: "workspace",
        install: {
          localPath: "extensions/demo-provider",
          defaultChoice: "local",
        },
        installSource: {
          defaultChoice: "local",
          local: {
            path: "extensions/demo-provider",
          },
          warnings: [],
        },
      },
    ]);
  });

  it("resolves one installable auth choice by id", () => {
    discoverOpenClawPlugins.mockReturnValue({
      candidates: [
        {
          idHint: "vllm",
          origin: "config",
          rootDir: "/Users/test/.openclaw/extensions/vllm",
          source: "/Users/test/.openclaw/extensions/vllm/index.js",
          packageName: "@openclaw/vllm",
          packageDir: "/Users/test/.openclaw/extensions/vllm",
          packageManifest: {
            install: {
              npmSpec: "@openclaw/vllm@2.0.0",
              expectedIntegrity: "sha512-vllm",
            },
          },
        },
      ],
      diagnostics: [],
    });
    loadPluginManifest.mockReturnValue({
      ok: true,
      manifestPath: "/Users/test/.openclaw/extensions/vllm/openclaw.plugin.json",
      manifest: {
        id: "vllm",
        configSchema: {
          type: "object",
        },
      },
    });
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "vllm",
        providerId: "vllm",
        methodId: "server",
        choiceId: "vllm",
        choiceLabel: "vLLM",
        groupLabel: "vLLM",
      },
    ]);

    expect(resolveProviderInstallCatalogEntry("vllm")).toEqual({
      pluginId: "vllm",
      providerId: "vllm",
      methodId: "server",
      choiceId: "vllm",
      choiceLabel: "vLLM",
      groupLabel: "vLLM",
      label: "vLLM",
      origin: "config",
      install: {
        npmSpec: "@openclaw/vllm@2.0.0",
        expectedIntegrity: "sha512-vllm",
        defaultChoice: "npm",
      },
      installSource: {
        defaultChoice: "npm",
        npm: {
          spec: "@openclaw/vllm@2.0.0",
          packageName: "@openclaw/vllm",
          selector: "2.0.0",
          selectorKind: "exact-version",
          exactVersion: true,
          expectedIntegrity: "sha512-vllm",
          pinState: "exact-with-integrity",
        },
        warnings: [],
      },
    });
  });

  it("exposes trusted registry npm specs without requiring an exact version or integrity pin", () => {
    discoverOpenClawPlugins.mockReturnValue({
      candidates: [
        {
          idHint: "vllm",
          origin: "config",
          rootDir: "/Users/test/.openclaw/extensions/vllm",
          source: "/Users/test/.openclaw/extensions/vllm/index.js",
          packageName: "@openclaw/vllm",
          packageDir: "/Users/test/.openclaw/extensions/vllm",
          packageManifest: {
            install: {
              npmSpec: "@openclaw/vllm",
            },
          },
        },
      ],
      diagnostics: [],
    });
    loadPluginManifest.mockReturnValue({
      ok: true,
      manifestPath: "/Users/test/.openclaw/extensions/vllm/openclaw.plugin.json",
      manifest: {
        id: "vllm",
        configSchema: {
          type: "object",
        },
      },
    });
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "vllm",
        providerId: "vllm",
        methodId: "server",
        choiceId: "vllm",
        choiceLabel: "vLLM",
      },
    ]);

    expect(resolveProviderInstallCatalogEntry("vllm")).toEqual({
      pluginId: "vllm",
      providerId: "vllm",
      methodId: "server",
      choiceId: "vllm",
      choiceLabel: "vLLM",
      label: "vLLM",
      origin: "config",
      install: {
        npmSpec: "@openclaw/vllm",
        defaultChoice: "npm",
      },
      installSource: {
        defaultChoice: "npm",
        npm: {
          spec: "@openclaw/vllm",
          packageName: "@openclaw/vllm",
          selectorKind: "none",
          exactVersion: false,
          pinState: "floating-without-integrity",
        },
        warnings: ["npm-spec-floating", "npm-spec-missing-integrity"],
      },
    });
  });

  it("warns when provider install npmSpec drifts from package identity", () => {
    discoverOpenClawPlugins.mockReturnValue({
      candidates: [
        {
          idHint: "vllm",
          origin: "config",
          rootDir: "/Users/test/.openclaw/extensions/vllm",
          source: "/Users/test/.openclaw/extensions/vllm/index.js",
          packageName: "@openclaw/vllm",
          packageDir: "/Users/test/.openclaw/extensions/vllm",
          packageManifest: {
            install: {
              npmSpec: "@openclaw/vllm-fork@2.0.0",
              expectedIntegrity: "sha512-vllm",
            },
          },
        },
      ],
      diagnostics: [],
    });
    loadPluginManifest.mockReturnValue({
      ok: true,
      manifestPath: "/Users/test/.openclaw/extensions/vllm/openclaw.plugin.json",
      manifest: {
        id: "vllm",
        configSchema: {
          type: "object",
        },
      },
    });
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "vllm",
        providerId: "vllm",
        methodId: "server",
        choiceId: "vllm",
        choiceLabel: "vLLM",
      },
    ]);

    expect(resolveProviderInstallCatalogEntry("vllm")?.installSource).toEqual({
      defaultChoice: "npm",
      npm: {
        spec: "@openclaw/vllm-fork@2.0.0",
        packageName: "@openclaw/vllm-fork",
        expectedPackageName: "@openclaw/vllm",
        selector: "2.0.0",
        selectorKind: "exact-version",
        exactVersion: true,
        expectedIntegrity: "sha512-vllm",
        pinState: "exact-with-integrity",
      },
      warnings: ["npm-spec-package-name-mismatch"],
    });
  });

  it("does not expose npm install specs from untrusted package metadata", () => {
    discoverOpenClawPlugins.mockReturnValue({
      candidates: [
        {
          idHint: "demo-provider",
          origin: "global",
          rootDir: "/Users/test/.openclaw/extensions/demo-provider",
          source: "/Users/test/.openclaw/extensions/demo-provider/index.js",
          packageName: "@vendor/demo-provider",
          packageDir: "/Users/test/.openclaw/extensions/demo-provider",
          packageManifest: {
            install: {
              npmSpec: "@vendor/demo-provider@1.2.3",
              expectedIntegrity: "sha512-demo",
            },
          },
        },
      ],
      diagnostics: [],
    });
    loadPluginManifest.mockReturnValue({
      ok: true,
      manifestPath: "/Users/test/.openclaw/extensions/demo-provider/openclaw.plugin.json",
      manifest: {
        id: "demo-provider",
        configSchema: {
          type: "object",
        },
      },
    });
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "demo-provider",
        providerId: "demo-provider",
        methodId: "api-key",
        choiceId: "demo-provider-api-key",
        choiceLabel: "Demo Provider API key",
      },
    ]);

    expect(resolveProviderInstallCatalogEntries()).toEqual([]);
  });

  it("skips untrusted workspace install candidates when requested", () => {
    discoverOpenClawPlugins.mockReturnValue({
      candidates: [
        {
          idHint: "demo-provider",
          origin: "workspace",
          rootDir: "/repo/extensions/demo-provider",
          source: "/repo/extensions/demo-provider/index.ts",
          workspaceDir: "/repo",
          packageName: "@vendor/demo-provider",
          packageDir: "/repo/extensions/demo-provider",
          packageManifest: {
            install: {
              npmSpec: "@vendor/demo-provider",
            },
          },
        },
      ],
      diagnostics: [],
    });

    expect(
      resolveProviderInstallCatalogEntries({
        config: {
          plugins: {
            enabled: false,
          },
        },
        includeUntrustedWorkspacePlugins: false,
      }),
    ).toEqual([]);
    expect(loadPluginManifest).not.toHaveBeenCalled();
  });

  it("skips untrusted workspace candidates without id hints before manifest load", () => {
    discoverOpenClawPlugins.mockReturnValue({
      candidates: [
        {
          idHint: "",
          origin: "workspace",
          rootDir: "/repo/extensions/demo-provider",
          source: "/repo/extensions/demo-provider/index.ts",
          workspaceDir: "/repo",
          packageName: "@vendor/demo-provider",
          packageDir: "/repo/extensions/demo-provider",
          packageManifest: {
            install: {
              npmSpec: "@vendor/demo-provider",
            },
          },
        },
      ],
      diagnostics: [],
    });

    expect(
      resolveProviderInstallCatalogEntries({ includeUntrustedWorkspacePlugins: false }),
    ).toEqual([]);
    expect(loadPluginManifest).not.toHaveBeenCalled();
  });
});
