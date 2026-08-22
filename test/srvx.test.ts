import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import test from "node:test"
import { serve } from "srvx"
import { createSrvxServerEntry } from "../src/srvx.ts"
import { defineApp, route } from "../src/index.ts"

const shell = "/src/AppShell.tsrx"

test("composes transport concerns behind one basename-aware entry", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "flamefront-srvx-entry-"))
  const clientDirectory = resolve(root, "client")

  await mkdir(resolve(clientDirectory, "assets"), { recursive: true })
  await mkdir(resolve(clientDirectory, "static"), { recursive: true })
  await writeFile(resolve(clientDirectory, "assets/app.js"), "asset")
  await writeFile(
    resolve(clientDirectory, "static/index.html"),
    "<main>static artifact</main>",
  )

  const app = defineApp({
    shell,
    routing: { basename: "/docs", dataPath: "/docs/__data" },
    routes: [
      route("/client", "/src/Client.tsrx", { render: "client" }),
      route("/server", "/src/Server.tsrx", { render: "server" }),
      route("/static", "/src/Static.tsrx", { render: "static" }),
    ],
  })
  const renderedModes: string[] = []
  const loadedDataUrls: string[] = []
  const middlewareEvents: string[] = []
  const entry = createSrvxServerEntry({
    app,
    documents: {
      loadRouteData: async (request) => {
        loadedDataUrls.push(new URL(request.url).searchParams.get("url") ?? "")
        return Response.json({ loaded: true })
      },
      renderDocument: async (_template, _request, options) => {
        const mode = options?.mode ?? "server"

        renderedModes.push(mode)
        return {
          html: `<main>${mode}</main>`,
          status: mode === "server" ? 201 : 200,
          headers: { "X-Document": "document" },
        }
      },
    },
    assets: {
      clientDirectory,
      loadTemplate: ({ route: matchedRoute, mode }) =>
        `<html><body>${matchedRoute?.path}:${mode}</body></html>`,
    },
    middleware: [
      async (_request, next) => {
        middlewareEvents.push("before")
        const response = await next()

        middlewareEvents.push("after")
        response.headers.set("X-Middleware", "outer")
        return response
      },
    ],
    headers: ({ document, mode }) => ({
      "Content-Type": "text/custom",
      "X-Policy": `${mode}:${document.status ?? 200}`,
    }),
  })
  const server = serve({ ...entry, manual: true, silent: true })

  try {
    const redirect = await server.fetch(
      new Request("http://flamefront.test/docs"),
    )

    assert.equal(redirect.status, 302)
    assert.equal(redirect.headers.get("location"), "/docs/client")

    const client = await server.fetch(
      new Request("http://flamefront.test/docs/client"),
    )

    assert.equal(client.status, 200)
    assert.equal(await client.text(), "<main>client</main>")
    assert.equal(client.headers.get("content-type"), "text/custom")
    assert.equal(client.headers.get("x-document"), "document")
    assert.equal(client.headers.get("x-policy"), "client:200")
    assert.equal(client.headers.get("x-middleware"), "outer")

    const serverDocument = await server.fetch(
      new Request("http://flamefront.test/docs/server"),
    )

    assert.equal(serverDocument.status, 201)
    assert.equal(await serverDocument.text(), "<main>server</main>")
    assert.equal(serverDocument.headers.get("x-policy"), "server:201")

    const staticDocument = await server.fetch(
      new Request("http://flamefront.test/docs/static"),
    )

    assert.equal(await staticDocument.text(), "<main>static artifact</main>")

    const asset = await server.fetch(
      new Request("http://flamefront.test/docs/assets/app.js"),
    )

    assert.equal(await asset.text(), "asset")

    const routeUrl = "http://flamefront.test/docs/server"
    const dataEndpoint = new URL("http://flamefront.test/docs/__data")

    dataEndpoint.searchParams.set("url", routeUrl)
    const data = await server.fetch(new Request(dataEndpoint))

    assert.deepEqual(await data.json(), { loaded: true })
    assert.deepEqual(loadedDataUrls, [routeUrl])

    assert.deepEqual(renderedModes, ["client", "server"])
    assert.deepEqual(middlewareEvents.slice(0, 2), ["before", "after"])
  } finally {
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
})
