export const miscExtensionTestRoots = [
  "extensions/llm-task",
  "extensions/openshell",
  "extensions/thread-ownership",
  "extensions/webhooks",
];

export function isMiscExtensionRoot(root) {
  return miscExtensionTestRoots.includes(root);
}
