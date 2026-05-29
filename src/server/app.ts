import type { Server } from "node:http";
import express, { type Express } from "express";
import { createApprovalService } from "../approvals/service.js";
import { createRunService } from "../runs/service.js";
import { createSchedulerService } from "../scheduler/service.js";
import { openIclawDatabase } from "../storage/sqlite.js";
import { createWebhookService } from "../webhooks/service.js";
import { attachApprovalRoutes } from "./routes/approvals.js";
import { attachRunRoutes } from "./routes/runs.js";
import { attachScheduleRoutes } from "./routes/schedules.js";
import { attachWebhookRoutes } from "./routes/webhooks.js";

export type IclawServices = ReturnType<typeof createIclawServices>;

export function createIclawServices(input: { dbPath: string }) {
  const db = openIclawDatabase(input.dbPath);
  const runService = createRunService(db);
  const schedulerService = createSchedulerService({ db, runService });
  const webhookService = createWebhookService({ db, runService });
  const approvalService = createApprovalService(db);
  return {
    approvalService,
    db,
    dbPath: input.dbPath,
    runService,
    schedulerService,
    webhookService,
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

  attachRunRoutes(app, input.services.runService);
  attachScheduleRoutes(app, input.services.schedulerService);
  attachWebhookRoutes(app, input.services.webhookService);
  attachApprovalRoutes(app, input.services.approvalService);

  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    },
  );

  return app;
}

export async function startIclawServer(input: {
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
  const services = createIclawServices({ dbPath: input.dbPath });
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
