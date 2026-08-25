import { defineConfig } from "vitest/config"
import { octane } from "octane/compiler/vite"

export default defineConfig({
  plugins: [octane({ ssr: true })],
  test: {
    include: ["test/**/*.test.ts"],
  },
})
