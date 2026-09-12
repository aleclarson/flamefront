import { octane } from "@octanejs/vite-plugin"
import { flamefront } from "flamefront/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    flamefront({
      target: "node",
      prerender: { revision: "website-v1" },
    }),
    octane(),
  ],
  build: { target: "esnext" },
})
