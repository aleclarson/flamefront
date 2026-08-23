import { defineConfig } from "vite"
import { octane } from "@octanejs/vite-plugin"
import { flamefront } from "flamefront/vite"

export default defineConfig({
  plugins: [flamefront(), octane()],
  build: {
    sourcemap: true,
    target: "esnext",
  },
})
