#!/usr/bin/env node

const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 14;

function parseNodeVersion(rawVersion) {
  const [majorRaw = "0", minorRaw = "0"] = rawVersion.split(".");
  return {
    major: Number(majorRaw),
    minor: Number(minorRaw),
  };
}

function isSupportedNodeVersion(version) {
  return (
    version.major > MIN_NODE_MAJOR ||
    (version.major === MIN_NODE_MAJOR && version.minor >= MIN_NODE_MINOR)
  );
}

if (!isSupportedNodeVersion(parseNodeVersion(process.versions.node))) {
  process.stderr.write(
    `iclaw: Node.js v${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+ is required (current: v${process.versions.node}).\n`,
  );
  process.exit(1);
}

try {
  await import("./dist/entry.js");
} catch (error) {
  if (error?.code === "ERR_MODULE_NOT_FOUND") {
    throw new Error("iclaw: missing build output. Run `pnpm build` first.", { cause: error });
  }
  throw error;
}
