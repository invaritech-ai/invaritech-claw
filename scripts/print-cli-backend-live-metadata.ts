import { resolveCliBackendConfig, resolveCliBackendLiveTest } from "../src/agents/cli-backends.js";

const provider = process.argv[2]?.trim().toLowerCase();

if (!provider) {
  console.error("usage: node scripts/print-cli-backend-live-metadata.ts <provider>");
  process.exit(1);
}

async function loadFallbackBackend(_id: string) {
  return null;
}

const resolved = resolveCliBackendConfig(provider);
const liveTest = resolveCliBackendLiveTest(provider);
const fallbackBackend =
  !resolved || !liveTest?.defaultModelRef ? await loadFallbackBackend(provider) : null;
const backendConfig = resolved?.config ?? fallbackBackend?.config;
const backendLiveTest =
  liveTest ??
  (fallbackBackend
    ? {
        defaultModelRef: fallbackBackend.liveTest?.defaultModelRef,
        defaultImageProbe: fallbackBackend.liveTest?.defaultImageProbe === true,
        defaultMcpProbe: fallbackBackend.liveTest?.defaultMcpProbe === true,
        dockerNpmPackage: fallbackBackend.liveTest?.docker?.npmPackage,
        dockerBinaryName: fallbackBackend.liveTest?.docker?.binaryName,
      }
    : null);

process.stdout.write(
  JSON.stringify(
    {
      provider,
      command: backendConfig?.command,
      args: backendConfig?.args,
      clearEnv: backendConfig?.clearEnv ?? [],
      imageArg: backendConfig?.imageArg,
      imageMode: backendConfig?.imageMode,
      systemPromptWhen: backendConfig?.systemPromptWhen ?? "never",
      bundleMcp: resolved?.bundleMcp === true || fallbackBackend?.bundleMcp === true,
      bundleMcpMode: resolved?.bundleMcpMode ?? fallbackBackend?.bundleMcpMode,
      defaultModelRef: backendLiveTest?.defaultModelRef,
      defaultImageProbe: backendLiveTest?.defaultImageProbe === true,
      defaultMcpProbe: backendLiveTest?.defaultMcpProbe === true,
      dockerNpmPackage: backendLiveTest?.dockerNpmPackage,
      dockerBinaryName: backendLiveTest?.dockerBinaryName,
    },
    null,
    2,
  ),
);
