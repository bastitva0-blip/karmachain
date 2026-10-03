import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { NODE_ENV: "test", PGLITE_DIR: "memory://", DATABASE_URL: "" },
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
  },
});
