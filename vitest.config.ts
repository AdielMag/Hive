import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: [
            "packages/*/test/**/*.test.ts",
            "apps/desktop/src/**/*.test.ts",
            "modules/*/src/**/*.test.ts",
            "scripts/**/*.test.ts",
          ],
          environment: "node",
        },
      },
      {
        test: {
          name: "contract",
          include: ["packages/*/test/**/*.contract.ts"],
          environment: "node",
          testTimeout: 60_000,
          hookTimeout: 60_000,
          // Real Pi processes: keep them serialized to stay deterministic on Windows.
          fileParallelism: false,
        },
      },
    ],
  },
});
