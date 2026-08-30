import assert from "node:assert/strict"
import { test } from "vitest"
import { defineApp, route } from "../src/index.ts"
import { createFetchServerEntry } from "../src/fetch.ts"

test("serves a transport-neutral Fetch entry without srvx", async () => {
  const app = defineApp({
    shell: "/src/AppShell.tsrx",
    routing: { basename: "/docs", dataPath: "/docs/__data" },
    routes: [
      route("/client", "/src/Client.tsrx", { render: "client" }),
      route("/server", "/src/Server.tsrx", { render: "server" }),
      route("/static", "/src/Static.tsrx", { render: "static" }),
    ],
  })
  const middlewareEvents: string[] = []
  const staticArtifact = {
    protocol: "flamefront-route-fragment-v1" as const,
    route: "/static",
    boundary: "flamefront:route:static",
    html: "<main>static</main>",
    routeData: { built: true },
    boundaries: [],
  }
  const entry = createFetchServerEntry({
    app,
    assets: {
      loadTemplate: ({ route: matchedRoute, mode }) =>
        `<html>${matchedRoute?.path}:${mode}</html>`,
      loadStaticFragment: async () => staticArtifact,
    },
    documents: {
      loadRouteData: async () => Response.json({ loaded: true }),
      renderDocument: async (_template, _request, options) => ({
        html: `<main>${options?.mode}</main>`,
        status: 200,
      }),
    },
    middleware: [
      async (_request, next) => {
        middlewareEvents.push("before")
        const response = await next()

        middlewareEvents.push("after")
        response.headers.set("X-Middleware", "fetch")
        return response
      },
    ],
  })

  const redirect = await entry.fetch(
    new Request("https://flamefront.test/docs"),
  )

  assert.equal(redirect.status, 302)
  assert.equal(redirect.headers.get("location"), "/docs/client")

  const document = await entry.fetch(
    new Request("https://flamefront.test/docs/server"),
  )

  assert.equal(await document.text(), "<main>server</main>")
  assert.equal(document.headers.get("x-middleware"), "fetch")

  const fragment = await entry.fetch(
    new Request("https://flamefront.test/docs/static?__flamefront_fragment=1"),
  )

  assert.deepEqual(await fragment.json(), staticArtifact)

  const data = await entry.fetch(
    new Request("https://flamefront.test/docs/__data?url=server"),
  )

  assert.deepEqual(await data.json(), { loaded: true })
  assert.deepEqual(middlewareEvents, [
    "before",
    "after",
    "before",
    "after",
    "before",
    "after",
    "before",
    "after",
  ])
})
