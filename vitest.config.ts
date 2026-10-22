import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@hive/protocol": resolve(import.meta.dirname, "packages/protocol/src/index.ts"),
      "@hive/pi-adapter/node": resolve(import.meta.dirname, "packages/pi-adapter/src/node/index.ts"),
      "@hive/pi-adapter": resolve(import.meta.dirname, "packages/pi-adapter/src/index.ts"),
      "@hive/module-sdk/format": resolve(import.meta.dirname, "packages/module-sdk/src/format.ts"),
      "@hive/module-sdk/renderer": resolve(import.meta.dirname, "packages/module-sdk/src/renderer.ts"),
      "@hive/module-sdk/main": resolve(import.meta.dirname, "packages/module-sdk/src/main.ts"),
      "@hive/module-sdk": resolve(import.meta.dirname, "packages/module-sdk/src/index.ts"),
      "@hive/theme-engine": resolve(import.meta.dirname, "packages/theme-engine/src/index.ts"),
    },
  },
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
          testTimeout: 20_000,
          hookTimeout: 20_000,
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
