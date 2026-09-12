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

test("keeps native form posts on the document path and enhances marked posts", async () => {
  const app = defineApp({
    shell: "/src/AppShell.tsrx",
    routes: [route("/edit", "/src/Edit.tsrx", { render: "server" })],
  })
  const calls: string[] = []
  const entry = createFetchServerEntry({
    app,
    assets: {
      loadTemplate: () => '<html><div id="root"></div></html>',
    },
    documents: {
      loadRouteData: async () => Response.json(null),
      loadAction: async () => {
        calls.push("action")
        return Response.json({ enhanced: true })
      },
      renderDocument: async (_template, request) => {
        calls.push(`document:${request.method}`)
        return { html: "<html>native</html>", status: 200 }
      },
    },
  })

  const native = await entry.fetch(
    new Request("https://flamefront.test/edit", {
      method: "POST",
      body: new URLSearchParams({ title: "Updated" }),
    }),
  )
  const enhanced = await entry.fetch(
    new Request("https://flamefront.test/edit?__flamefront_action=1", {
      method: "POST",
      body: new URLSearchParams({ title: "Updated" }),
    }),
  )

  assert.equal(await native.text(), "<html>native</html>")
  assert.deepEqual(await enhanced.json(), { enhanced: true })
  assert.deepEqual(calls, ["document:POST", "action"])
})

test("rejects cross-origin mutation requests before dispatch", async () => {
  const app = defineApp({
    shell: "/src/AppShell.tsrx",
    routes: [route("/edit", "/src/Edit.tsrx")],
  })
  let dispatched = false
  const entry = createFetchServerEntry({
    app,
    assets: { loadTemplate: () => '<html><div id="root"></div></html>' },
    documents: {
      loadRouteData: async () => Response.json(null),
      loadAction: async () => {
        dispatched = true
        return Response.json(null)
      },
      renderDocument: async () => ({ html: "", status: 200 }),
    },
  })

  const response = await entry.fetch(
    new Request("https://flamefront.test/edit?__flamefront_action=1", {
      method: "POST",
      headers: { Origin: "https://evil.test" },
    }),
  )

  assert.equal(response.status, 403)
  assert.equal(dispatched, false)
})
