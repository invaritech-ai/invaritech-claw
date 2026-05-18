import { bundledPluginRoot } from "../../scripts/lib/bundled-plugin-paths.mjs";

export const messagingExtensionIds = [];

export const messagingExtensionTestRoots = messagingExtensionIds.map((id) => bundledPluginRoot(id));

export function isMessagingExtensionRoot(root) {
  return messagingExtensionTestRoots.includes(root);
}
