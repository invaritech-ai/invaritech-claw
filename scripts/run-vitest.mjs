#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const vitestPackageJsonPath = require.resolve("vitest/package.json");
const vitestPackageJson = require(vitestPackageJsonPath);
const vitestCli = path.join(path.dirname(vitestPackageJsonPath), vitestPackageJson.bin.vitest);

const result = spawnSync(process.execPath, ["--no-maglev", vitestCli, ...process.argv.slice(2)], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
