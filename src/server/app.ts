import { timingSafeEqual } from "node:crypto";
import type { Server } from "node:http";
import express, { type Express } from "express";
import { parseIclawConfig } from "../config/schema.js";
import type { IclawConfig } from "../config/types.js";
import { openIclawDatabase } from "../storage/sqlite.js";
import { createThreadService } from "../threads/service.js";
import { createConfiguredProviders, resolveSecretRef } from "./providers.js";
import { attachThreadRoutes } from "./routes/threads.js";

export type IclawServices = ReturnType<typeof createIclawServices>;

export function createIclawServices(input: { dbPath: string; config?: IclawConfig }) {
  const db = openIclawDatabase(input.dbPath);
  const config = input.config ?? parseIclawConfig({});
  const threadService = createThreadService({ db, config });
  return {
    config,
    db,
    dbPath: input.dbPath,
    providers: createConfiguredProviders({ config }),
    threadService,
  };
}

function isLoopbackHost(host: string): boolean {
  return (
    host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "0:0:0:0:0:0:0:1"
  );
}

function assertServerSecurity(config: IclawConfig, host = config.server.host): void {
  if (!isLoopbackHost(host) && !config.server.apiToken) {
    throw new Error("server.apiToken is required when binding iclaw to a non-loopback host");
  }
}

function isBearerTokenAuthorized(header: string | undefined, expectedToken: string): boolean {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) {
    return false;
  }
  const token = header.slice(prefix.length);
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expectedToken);
  return (
    tokenBuffer.length === expectedBuffer.length && timingSafeEqual(tokenBuffer, expectedBuffer)
  );
}

function serverUrl(input: { host: string; port: number; server: Server }): string {
  const address = input.server.address();
  const port = typeof address === "object" && address ? address.port : input.port;
  return `http://${input.host}:${port}`;
}

export function createIclawApp(input: { services: IclawServices; bindHost?: string }): Express {
  assertServerSecurity(input.services.config, input.bindHost);
  const apiToken = input.services.config.server.apiToken
    ? resolveSecretRef(input.services.config.server.apiToken)
    : undefined;
  const app = express();
  if (apiToken) {
    app.use((req, res, next) => {
      if (isBearerTokenAuthorized(req.get("authorization"), apiToken)) {
        next();
        return;
      }
      res.status(401).json({ error: "unauthorized" });
    });
  }
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      databasePath: input.services.dbPath,
      serverTimeMs: Date.now(),
    });
  });

  attachThreadRoutes(app, {
    config: input.services.config,
    providers: input.services.providers,
    threadService: input.services.threadService,
  });

  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    },
  );

  return app;
}

export async function startIclawServer(input: {
  config?: IclawConfig;
  dbPath: string;
  host: string;
  port: number;
}): Promise<{
  app: Express;
  close(): Promise<void>;
  server: Server;
  services: IclawServices;
  url: string;
}> {
  const config = input.config ?? parseIclawConfig({});
  assertServerSecurity(config, input.host);
  const services = createIclawServices({ dbPath: input.dbPath, config });
  const app = createIclawApp({ services, bindHost: input.host });
  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app
      .listen(input.port, input.host, () => resolve(listener))
      .once("error", reject);
  });

  return {
    app,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      services.db.close();
    },
    server,
    services,
    url: serverUrl({ host: input.host, port: input.port, server }),
  };
}
