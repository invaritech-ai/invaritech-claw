#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const tsdownPackageJsonPath = require.resolve("tsdown/package.json");
const tsdownPackageJson = require(tsdownPackageJsonPath);
const tsdownCli = path.join(path.dirname(tsdownPackageJsonPath), tsdownPackageJson.bin.tsdown);

const result = spawnSync(process.execPath, [tsdownCli, ...process.argv.slice(2)], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
