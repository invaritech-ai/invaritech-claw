import { bundledPluginRoot } from "../../scripts/lib/bundled-plugin-paths.mjs";

export const providerExtensionIds = ["ollama", "openrouter"];

export const providerExtensionTestRoots = providerExtensionIds.map((id) => bundledPluginRoot(id));

export function isProviderExtensionRoot(root) {
  return providerExtensionTestRoots.includes(root);
}
