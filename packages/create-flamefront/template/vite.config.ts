import { octane } from "@octanejs/vite-plugin"
import { flamefront } from "flamefront/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [flamefront({ target: "node" }), octane()],
})
