#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const result = spawnSync("pnpm", ["check"], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
