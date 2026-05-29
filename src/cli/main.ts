import { loadIclawConfigIfExists } from "../config/load.js";
import { resolveConfigPath, resolveSqlitePath } from "../config/paths.js";
import type { IclawConfig } from "../config/types.js";
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
  providers: {},
  server: {
    host: "127.0.0.1",
    port: 32768,
  },
  storage: {},
};

function printHelp(): void {
  process.stdout.write(`iclaw ${ICLAW_VERSION}

Usage:
  iclaw server [--host <host>] [--port <port>] [--config <path>]
  iclaw tui [--base-url <url>] [--view <chat|runs|schedules|webhooks|status>]
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
    dbPath: resolveSqlitePath(config),
    host,
    port,
  });
  process.stdout.write(`iclaw server listening on ${server.url}\n`);
  process.stdout.write(`config: ${configPath}\n`);

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      void server.close().finally(resolve);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

async function runTui(args: string[]): Promise<void> {
  const baseUrl = readFlag(args, "--base-url") ?? "http://127.0.0.1:32768";
  const activeView = (readFlag(args, "--view") ?? "status") as OperatorView;
  const client = createNativeOperatorApiClient({ baseUrl });
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
