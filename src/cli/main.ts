import { loadIclawConfigIfExists } from "../config/load.js";
import { resolveConfigPath, resolveSqlitePath } from "../config/paths.js";
import type { IclawConfig } from "../config/types.js";
import { runInteractiveOperatorConsole } from "../tui/interactive.js";
import { createNativeOperatorApiClient } from "../tui/operator-api.js";
import {
  buildOperatorActiveView,
  createOperatorConsoleState,
  refreshOperatorView,
  switchOperatorView,
  type OperatorView,
} from "../tui/operator-console.js";
import { ICLAW_VERSION } from "../version.js";

const DEFAULT_CONFIG: IclawConfig = {
  agents: {},
  compaction: {
    keepRecentMessages: 12,
  },
  context: {
    maxTokens: 32_000,
    responseReservePercent: 15,
    memoryPercent: 15,
    summaryPercent: 20,
    recentMessagesPercent: 50,
  },
  memory: {},
  models: {
    chat: "ollama/gemma4:e4b",
    memory: "ollama/qwen3:4b",
    compaction: "ollama/gemma4:e4b",
    embedding: "ollama/mxbai-embed-large:latest",
    favorites: [],
    contextWindows: {},
  },
  providers: {},
  server: {
    host: "127.0.0.1",
    port: 32768,
  },
  storage: {},
  workers: {
    enabled: true,
    pollIntervalMs: 1000,
  },
};

function printHelp(): void {
  process.stdout.write(`iclaw ${ICLAW_VERSION}

Usage:
  iclaw server [--host <host>] [--port <port>] [--config <path>]
  iclaw tui [--base-url <url>] [--agent <agent>] [--view <chat|runs|status>]
  iclaw --help
  iclaw --version
`);
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function readConfig(args: string[]): { config: IclawConfig; configPath: string } {
  const configPath = readFlag(args, "--config") ?? resolveConfigPath();
  return {
    config: loadIclawConfigIfExists(configPath) ?? DEFAULT_CONFIG,
    configPath,
  };
}

async function runServer(args: string[]): Promise<void> {
  const { startIclawServer } = await import("../server/app.js");
  const { config, configPath } = readConfig(args);
  const host = readFlag(args, "--host") ?? config.server.host;
  const port = Number.parseInt(readFlag(args, "--port") ?? String(config.server.port), 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65_535) {
    throw new Error("port must be between 1 and 65535");
  }

  const server = await startIclawServer({
    config,
    dbPath: resolveSqlitePath(config),
    host,
    port,
  });
  process.stdout.write(`iclaw server listening on ${server.url}\n`);
  process.stdout.write(`config: ${configPath}\n`);

  const keepAlive = setInterval(() => undefined, 60 * 60 * 1000);
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      clearInterval(keepAlive);
      void server.close().finally(resolve);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

async function runTui(args: string[]): Promise<void> {
  const baseUrl = readFlag(args, "--base-url") ?? "http://127.0.0.1:32768";
  const client = createNativeOperatorApiClient({ baseUrl });
  const view = readFlag(args, "--view");
  if (!view) {
    await runInteractiveOperatorConsole({
      agentId: readFlag(args, "--agent") ?? "main",
      client,
      input: process.stdin,
      output: process.stdout,
    });
    return;
  }
  const activeView = view as OperatorView;
  const state = await refreshOperatorView(
    switchOperatorView(createOperatorConsoleState(), activeView),
    client,
  );
  process.stdout.write(`${JSON.stringify(buildOperatorActiveView(state), null, 2)}\n`);
}

export async function runCli(argv = process.argv): Promise<void> {
  const args = argv.slice(2);
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`${ICLAW_VERSION}\n`);
    return;
  }
  if (command === "server") {
    await runServer(args.slice(1));
    return;
  }
  if (command === "tui") {
    await runTui(args.slice(1));
    return;
  }
  throw new Error(`unknown command: ${command}`);
}
