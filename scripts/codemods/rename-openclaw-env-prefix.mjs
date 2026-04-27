#!/usr/bin/env node
/**
 * Replace legacy `OPEN`+`CLAW_` env prefix with `ICLAW_` across git-tracked files.
 * String literals are split so this file is safe if someone greps/replaces the prefix project-wide.
 *
 * Run: `node scripts/codemods/rename-openclaw-env-prefix.mjs`
 * Complement (untracked / missed): `node scripts/codemods/rename-openclaw-env-prefix-fs.mjs`
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = process.cwd();
const OLD_PREFIX = `OPEN${"CLAW_"}`;
const NEW_PREFIX = "ICLAW_";

const PATHSPECS = [
  ".",
  ":(exclude)CHANGELOG.md",
  ":(exclude).artifacts/**",
  ":(exclude)node_modules/**",
  ":(exclude)**/node_modules/**",
  ":(exclude)dist/**",
  ":(exclude)**/dist/**",
  `:(exclude)scripts/codemods/rename-openclaw-env-prefix.mjs`,
  `:(exclude)scripts/codemods/rename-openclaw-env-prefix-fs.mjs`,
];

let files;
try {
  const out = execFileSync(
    "git",
    ["-c", "core.quotepath=off", "grep", "-l", OLD_PREFIX, "--", ...PATHSPECS],
    {
      encoding: "utf8",
      cwd: REPO,
      maxBuffer: 200 * 1024 * 1024,
    },
  );
  files = out.trim().split("\n").filter(Boolean);
} catch (err) {
  if (err && err.status === 1) {
    files = [];
  } else {
    throw err;
  }
}

let changed = 0;
let skipped = 0;
for (const rel of files) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    skipped++;
    continue;
  }
  let s;
  try {
    s = fs.readFileSync(abs, "utf8");
  } catch {
    skipped++;
    continue;
  }
  if (!s.includes(OLD_PREFIX)) {
    continue;
  }
  const next = s.split(OLD_PREFIX).join(NEW_PREFIX);
  if (next !== s) {
    fs.writeFileSync(abs, next);
    changed++;
  }
}
console.log(
  `updated ${changed} file(s) (${files.length} matched ${OLD_PREFIX}; ${skipped} skipped read/path)`,
);
