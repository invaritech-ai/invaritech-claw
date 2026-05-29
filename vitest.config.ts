import { defineConfig } from "vitest/config";

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
    },
    include: ["test/**/*.test.ts"],
    maxWorkers: parsePositiveInt(process.env.ICLAW_VITEST_MAX_WORKERS),
    restoreMocks: true,
    testTimeout: 10_000,
  },
});
