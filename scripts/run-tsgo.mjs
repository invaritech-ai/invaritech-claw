#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const tsgoPackageJsonPath = require.resolve("@typescript/native-preview/package.json");
const tsgoPackageJson = require(tsgoPackageJsonPath);
const tsgoCli = path.join(path.dirname(tsgoPackageJsonPath), tsgoPackageJson.bin.tsgo);

const result = spawnSync(process.execPath, [tsgoCli, ...process.argv.slice(2)], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
