import { bundledPluginRoot } from "../../scripts/lib/bundled-plugin-paths.mjs";

export const splitChannelExtensionShardSpecs = [];

export const splitChannelExtensionTestRoots = splitChannelExtensionShardSpecs.map((spec) =>
  bundledPluginRoot(spec.id),
);

export function resolveSplitChannelExtensionShard(root) {
  const normalizedRoot = root.replaceAll("\\", "/");
  return splitChannelExtensionShardSpecs.find(
    (spec) => bundledPluginRoot(spec.id) === normalizedRoot,
  );
}

export function isSplitChannelExtensionRoot(root) {
  return Boolean(resolveSplitChannelExtensionShard(root));
}
