#!/usr/bin/env node

import { relative } from "node:path"
import {
  binary,
  command,
  flag,
  number,
  option,
  optional,
  run,
  subcommands,
} from "@alloc/cmd-ts"
import {
  buildProject,
  devProject,
  loadProject,
  previewProject,
} from "./lifecycle.ts"
import { generateProjectTypes } from "./typegen.ts"

const routes = command({
  name: "routes",
  aliases: ["route"],
  description: "List the centralized route manifest for the current app.",
  args: {
    json: flag({
      long: "json",
      description: "Print the manifest as JSON.",
    }),
  },
  async handler({ json }) {
    const { app } = await loadProject()

    if (json) {
      console.log(JSON.stringify(app.routes, null, 2))
      return
    }

    for (const route of app.routes) {
      const hydration =
        typeof route.hydration === "object"
          ? JSON.stringify(route.hydration)
          : (route.hydration ?? "default")

      console.log(`${route.path}\t${route.render}\t${hydration}`)
    }
  },
})

const dev = command({
  name: "dev",
  description: "Start the development server for every render mode.",
  args: {
    port: option({
      long: "port",
      type: optional(number),
      description: "Port for the development server.",
    }),
  },
  handler: ({ port }) => devProject(process.cwd(), port),
})

const build = command({
  name: "build",
  description: "Build client and server bundles, then prerender static routes.",
  args: {},
  handler: () => buildProject(),
})

const preview = command({
  name: "preview",
  description: "Serve a production build locally.",
  args: {},
  handler: () => previewProject(),
})

const typegen = command({
  name: "typegen",
  description: "Generate route import declarations for the current app.",
  args: {},
  async handler() {
    const result = await generateProjectTypes()
    const status = result.written ? "Generated" : "Unchanged"
    const file = relative(process.cwd(), result.file) || "."

    console.log(`${status} ${file}.`)
  },
})

const cli = subcommands({
  name: "ff",
  version: "0.1.0-alpha.0",
  description: "Flamefront, a small compiler-oriented framework for Octane.",
  cmds: { build, dev, preview, routes, typegen },
})

await run(binary(cli), process.argv)
