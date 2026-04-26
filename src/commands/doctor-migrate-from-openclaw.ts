import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveRequiredHomeDir } from "../infra/home-dir.js";
import type { RuntimeEnv } from "../runtime.js";

export type DoctorMigrateFromOpenClawOptions = {
  force?: boolean;
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
};

function isDirNonEmpty(dir: string): boolean {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return false;
  }
  return entries.length > 0;
}

/**
 * Copy legacy `~/.openclaw` to `~/.iclaw` and rename `openclaw.json` → `iclaw.json` when present.
 * Honors `ICLAW_HOME` for the home root (same as config path resolution).
 */
export async function doctorMigrateFromOpenClaw(
  runtime: RuntimeEnv,
  opts: DoctorMigrateFromOpenClawOptions = {},
): Promise<void> {
  const env = opts.env ?? process.env;
  const homedir = opts.homedir ?? os.homedir;
  const home = resolveRequiredHomeDir(env, homedir);
  const legacyDir = path.join(home, ".openclaw");
  const newDir = path.join(home, ".iclaw");
  const force = Boolean(opts.force);

  if (!fs.existsSync(legacyDir)) {
    runtime.log(`No legacy state directory at ${legacyDir}; nothing to migrate.`);
    return;
  }

  if (fs.existsSync(newDir) && isDirNonEmpty(newDir)) {
    if (!force) {
      throw new Error(
        [
          `Target state directory already exists and is not empty: ${newDir}`,
          "Re-run with --force to remove it and replace with a copy of ~/.openclaw (destructive).",
        ].join("\n"),
      );
    }
    fs.rmSync(newDir, { recursive: true, force: true });
  }

  fs.cpSync(legacyDir, newDir, { recursive: true });

  const legacyConfigName = "openclaw.json";
  const newConfigName = "iclaw.json";
  const oldConfigPath = path.join(newDir, legacyConfigName);
  const newConfigPath = path.join(newDir, newConfigName);

  if (fs.existsSync(oldConfigPath)) {
    if (fs.existsSync(newConfigPath)) {
      if (!force) {
        throw new Error(
          [
            `Both ${oldConfigPath} and ${newConfigPath} exist after copy.`,
            "Remove or rename one, or re-run with --force to delete iclaw.json then keep the renamed openclaw.json.",
          ].join("\n"),
        );
      }
      fs.rmSync(newConfigPath);
    }
    fs.renameSync(oldConfigPath, newConfigPath);
  }

  runtime.log("Migration complete.");
  runtime.log(`  Source: ${legacyDir}`);
  runtime.log(`  Target: ${newDir}`);
  if (fs.existsSync(newConfigPath)) {
    runtime.log(`  Config: ${newConfigPath}`);
  }
}
