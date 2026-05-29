import type { Server } from "node:http";
import express, { type Express } from "express";
import type { IclawConfig } from "../config/types.js";
import { createRunService } from "../runs/service.js";
import { openIclawDatabase } from "../storage/sqlite.js";
import { createConfiguredProviders } from "./providers.js";
import { attachRunRoutes } from "./routes/runs.js";

export type IclawServices = ReturnType<typeof createIclawServices>;

export function createIclawServices(input: { dbPath: string; config?: IclawConfig }) {
  const db = openIclawDatabase(input.dbPath);
  const runService = createRunService(db);
  const config = input.config ?? {
    agents: {},
    providers: {},
    server: { host: "127.0.0.1", port: 32768 },
    storage: {},
  };
  return {
    config,
    db,
    dbPath: input.dbPath,
    providers: createConfiguredProviders({ config }),
    runService,
  };
}

export function createIclawApp(input: { services: IclawServices }): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      databasePath: input.services.dbPath,
      serverTimeMs: Date.now(),
    });
  });

  attachRunRoutes(app, input.services.runService, {
    agents: input.services.config.agents,
    providers: input.services.providers,
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
  const services = createIclawServices({ dbPath: input.dbPath, config: input.config });
  const app = createIclawApp({ services });
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
    url: `http://${input.host}:${input.port}`,
  };
}
