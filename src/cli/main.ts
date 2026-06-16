import { loadIclawConfigIfExists } from "../config/load.js";
import { resolveConfigPath, resolveSqlitePath } from "../config/paths.js";
import type { IclawConfig, SecretRef } from "../config/types.js";
import { runInteractiveOperatorConsole } from "../tui/interactive.js";
import { createNativeOperatorApiClient } from "../tui/operator-api.js";
import {
  buildOperatorActiveView,
  createOperatorConsoleState,
  refreshOperatorView,
  switchOperatorView,
} from "../tui/operator-console.js";
import { ICLAW_VERSION } from "../version.js";
import { DEFAULT_CONFIG, initIclawConfig } from "./init.js";

function printHelp(): void {
  process.stdout.write(`iclaw ${ICLAW_VERSION}

Usage:
  iclaw init [--config <path>] [--force]
  iclaw server [--host <host>] [--port <port>] [--config <path>]
  iclaw tui [--agent <agent>] [--view <chat|status>] [--config <path>]
  iclaw tui --base-url <url> [--agent <agent>] [--view <chat|status>] [--config <path>] [--api-token <token>]
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

function parseOperatorView(view: string): "chat" | "status" {
  if (view === "chat" || view === "status") {
    return view;
  }
  throw new Error(`unknown tui view: ${view}. Expected one of: chat, status`);
}

function resolveOptionalSecretRef(secret: SecretRef | undefined): string | undefined {
  if (!secret) {
    return undefined;
  }
  if ("value" in secret) {
    return secret.value;
  }
  const value = process.env[secret.env]?.trim();
  if (!value) {
    throw new Error(`missing secret env var: ${secret.env}`);
  }
  return value;
}

async function runInit(args: string[]): Promise<void> {
  const configPath = readFlag(args, "--config") ?? resolveConfigPath();
  const result = await initIclawConfig({
    configPath,
    force: args.includes("--force"),
  });
  if (result.status === "exists") {
    process.stdout.write(`config exists: ${result.configPath}\n`);
    process.stdout.write("use --force to overwrite\n");
    return;
  }
  process.stdout.write(`created config: ${result.configPath}\n`);
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
  const { config } = readConfig(args);
  const apiToken =
    readFlag(args, "--api-token") ?? resolveOptionalSecretRef(config.server.apiToken);
  const explicitBaseUrl = readFlag(args, "--base-url");
  const embeddedServer = explicitBaseUrl
    ? undefined
    : await (async () => {
        const { startIclawServer } = await import("../server/app.js");
        return await startIclawServer({
          config,
          dbPath: resolveSqlitePath(config),
          host: "127.0.0.1",
          port: 0,
        });
      })();
  const baseUrl = explicitBaseUrl ?? embeddedServer?.url;
  if (!baseUrl) {
    throw new Error("failed to start iclaw tui server");
  }
  const client = createNativeOperatorApiClient({ baseUrl, apiToken });
  const view = readFlag(args, "--view");
  try {
    if (!view) {
      await runInteractiveOperatorConsole({
        agentId: readFlag(args, "--agent") ?? "main",
        client,
        input: process.stdin,
        output: process.stdout,
      });
      return;
    }
    const activeView = parseOperatorView(view);
    const state = await refreshOperatorView(
      switchOperatorView(createOperatorConsoleState(), activeView),
      client,
    );
    process.stdout.write(`${JSON.stringify(buildOperatorActiveView(state), null, 2)}\n`);
  } finally {
    await embeddedServer?.close();
  }
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
  if (command === "init") {
    await runInit(args.slice(1));
    return;
  }
  if (command === "tui") {
    await runTui(args.slice(1));
    return;
  }
  throw new Error(`unknown command: ${command}`);
}
