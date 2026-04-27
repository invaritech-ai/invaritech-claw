export const miscExtensionTestRoots = [
  "extensions/brave",
  "extensions/device-pair",
  "extensions/diagnostics-otel",
  "extensions/duckduckgo",
  "extensions/exa",
  "extensions/firecrawl",
  "extensions/llm-task",
  "extensions/lobster",
  "extensions/openshell",
  "extensions/perplexity",
  "extensions/phone-control",
  "extensions/searxng",
  "extensions/tavily",
  "extensions/thread-ownership",
  "extensions/webhooks",
];

export function isMiscExtensionRoot(root) {
  return miscExtensionTestRoots.includes(root);
}
