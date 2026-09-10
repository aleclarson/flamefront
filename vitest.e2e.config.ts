import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    fileParallelism: false,
    hookTimeout: 120_000,
    include: ["e2e/**/*.test.ts"],
    testTimeout: 120_000,
  },
})
