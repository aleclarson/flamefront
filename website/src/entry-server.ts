import { importRoute, loadActions } from "virtual:flamefront/server-routes"
import { createServerEntry } from "flamefront/entry"
import { createOctaneDocuments } from "flamefront/octane"
import { createRouteRuntime } from "flamefront/server"
import { app } from "./app.ts"
import { createForumContext, type ForumContext } from "./forum.server.ts"

const runtime = createRouteRuntime<ForumContext>({
  app,
  importRoute,
  loadActions,
  requestContext: () => createForumContext(),
})
const documents = createOctaneDocuments({ app, runtime })

export default createServerEntry({
  app,
  documents,
  assets: { clientDirectory: new URL("../client/", import.meta.url) },
})
