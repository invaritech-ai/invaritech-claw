import { BUNDLED_PLUGIN_TEST_GLOB } from "./vitest.bundled-plugin-paths.ts";
import { extensionExcludedChannelTestGlobs } from "./vitest.channel-paths.mjs";
import { browserExtensionTestRoots } from "./vitest.extension-browser-paths.mjs";
import { diffsExtensionTestRoots } from "./vitest.extension-diffs-paths.mjs";
import { mediaExtensionTestRoots } from "./vitest.extension-media-paths.mjs";
import { memoryExtensionTestRoots } from "./vitest.extension-memory-paths.mjs";
import { messagingExtensionTestRoots } from "./vitest.extension-messaging-paths.mjs";
import { miscExtensionTestRoots } from "./vitest.extension-misc-paths.mjs";
import { providerExtensionTestRoots } from "./vitest.extension-provider-paths.mjs";
import { loadPatternListFromEnv } from "./vitest.pattern-file.ts";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function loadIncludePatternsFromEnv(
  env: Record<string, string | undefined> = process.env,
): string[] | null {
  return loadPatternListFromEnv("ICLAW_VITEST_INCLUDE_FILE", env);
}

export function createExtensionsVitestConfig(
  env: Record<string, string | undefined> = process.env,
) {
  return createScopedVitestConfig(loadIncludePatternsFromEnv(env) ?? [BUNDLED_PLUGIN_TEST_GLOB], {
    dir: "extensions",
    env,
    name: "extensions",
    passWithNoTests: true,
    setupFiles: ["test/setup.extensions.ts"],
    // Some bundled plugins still run on the channel surface; keep those roots
    // out of the shared extensions lane.
    exclude: [
      ...extensionExcludedChannelTestGlobs,
      ...browserExtensionTestRoots.map((root) => `${root.replace(/^extensions\//u, "")}/**`),
      ...diffsExtensionTestRoots.map((root) => `${root.replace(/^extensions\//u, "")}/**`),
      ...mediaExtensionTestRoots.map((root) => `${root.replace(/^extensions\//u, "")}/**`),
      ...memoryExtensionTestRoots.map((root) => `${root.replace(/^extensions\//u, "")}/**`),
      ...messagingExtensionTestRoots.map((root) => `${root.replace(/^extensions\//u, "")}/**`),
      ...miscExtensionTestRoots.map((root) => `${root.replace(/^extensions\//u, "")}/**`),
      ...providerExtensionTestRoots.map((root) => `${root.replace(/^extensions\//u, "")}/**`),
    ],
  });
}

export default createExtensionsVitestConfig();
