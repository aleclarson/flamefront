import { defineConfig } from "vite"
import { octane } from "@octanejs/vite-plugin"
import { flamefront } from "flamefront/vite"

export default defineConfig({
  plugins: [flamefront({ target: "node" }), octane()],
  server: {
    // Keep the dev server's HMR socket off Vite's default port so a
    // concurrently running dev server cannot collide with the e2e suite.
    hmr: { port: 24699 },
  },
  build: {
    sourcemap: true,
    target: "esnext",
  },
})
