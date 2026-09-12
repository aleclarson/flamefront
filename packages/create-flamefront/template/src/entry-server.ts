import { importRoute } from "virtual:flamefront/server-routes"
import { createServerEntry } from "flamefront/entry"
import { createOctaneDocuments } from "flamefront/octane"
import { createRouteRuntime } from "flamefront/server"
import { app } from "./app.ts"

const runtime = createRouteRuntime({ app, importRoute })
const documents = createOctaneDocuments({ app, runtime })

export default createServerEntry({
  app,
  documents,
  assets: {
    clientDirectory: new URL("../client/", import.meta.url),
  },
})
