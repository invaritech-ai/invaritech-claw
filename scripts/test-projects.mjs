#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const passthrough = [];
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--changed") {
    index += 1;
    continue;
  }
  passthrough.push(arg);
}

const result = spawnSync(
  process.execPath,
  ["scripts/run-vitest.mjs", "run", "--config", "vitest.config.ts", ...passthrough],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
