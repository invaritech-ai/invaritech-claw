import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    entry: "src/entry.ts",
    index: "src/index.ts",
  },
  fixedExtension: false,
  format: "esm",
  outDir: "dist",
  platform: "node",
  sourcemap: false,
  target: "node22",
});
