import { defineConfig, mergeConfig } from "vitest/config"
import viteConfig from "./vite.config.ts"

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      fileParallelism: false,
      hookTimeout: 120_000,
      include: ["e2e/**/*.test.ts"],
      testTimeout: 120_000,
    },
  }),
)
