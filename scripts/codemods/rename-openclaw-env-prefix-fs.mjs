#!/usr/bin/env node
/**
 * Filesystem pass: replace `OPEN`+`CLAW_` with `ICLAW_` under common roots.
 * Catches untracked files and anything missed by the git-based codemod.
 * Does not contain the old prefix as a contiguous literal (safe for project-wide search/replace).
 */
import fs from "node:fs";
import path from "node:path";

const REPO = process.cwd();
const OLD_PREFIX = `OPEN${"CLAW_"}`;
const NEW_PREFIX = "ICLAW_";

const ROOTS = [
  "src",
  "scripts",
  "test",
  "extensions",
  "packages",
  "apps",
  "ui",
  ".github",
  "docs",
];
const SKIP_DIR = new Set([
  "node_modules",
  "dist",
  ".git",
  ".artifacts",
  "coverage",
]);
const EXT = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".yml",
  ".yaml",
  ".md",
  ".mdx",
  ".sh",
  ".swift",
  ".kt",
  ".kts",
  ".gradle",
  ".toml",
  ".xcconfig",
  ".podspec",
  ".xml",
  ".plist",
  ".env",
  ".example",
  ".cfg",
]);
const EXTRA_FILES = [
  "package.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "docker-compose.yml",
  "fly.toml",
  "fly.private.toml",
  "render.yaml",
  ".env.example",
  "openclaw.podman.env",
  "tsdown.config.ts",
  "knip.config.ts",
  "vitest.config.ts",
  ".pre-commit-config.yaml",
  ".dockerignore",
  "appcast.xml",
];

const SKIP_BASENAMES = new Set(["rename-openclaw-env-prefix.mjs", "rename-openclaw-env-prefix-fs.mjs"]);

function walk(dir, out) {
  let names;
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of names) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIR.has(ent.name)) continue;
      walk(p, out);
    } else {
      if (SKIP_BASENAMES.has(ent.name)) continue;
      const ext = path.extname(ent.name);
      if (EXT.has(ext) || ent.name === ".env.example" || ent.name.endsWith(".xcconfig")) {
        out.push(p);
      }
    }
  }
}

const collected = [];
for (const r of ROOTS) {
  const abs = path.join(REPO, r);
  if (fs.existsSync(abs)) walk(abs, collected);
}
const files = new Set(collected);
for (const f of EXTRA_FILES) {
  const abs = path.join(REPO, f);
  if (fs.existsSync(abs)) files.add(abs);
}

let changed = 0;
for (const abs of files) {
  if (path.basename(abs) === "rename-openclaw-env-prefix.mjs") continue;
  if (path.basename(abs) === "rename-openclaw-env-prefix-fs.mjs") continue;
  if (abs.endsWith(`${path.sep}CHANGELOG.md`) || abs.endsWith("/CHANGELOG.md")) continue;
  let s;
  try {
    s = fs.readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  if (!s.includes(OLD_PREFIX)) continue;
  fs.writeFileSync(abs, s.split(OLD_PREFIX).join(NEW_PREFIX));
  changed++;
}
console.log(`fs pass: updated ${changed} file(s) (${files.size} candidate files)`);
