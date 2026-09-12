import assert from "node:assert/strict"
import { test } from "vitest"
import * as devalue from "devalue"
import { defineApp, route } from "../src/index.ts"
import { action } from "../src/action.ts"
import { createRouteRuntime } from "../src/server.ts"

const shell = "/src/AppShell.tsrx"

test("uses the explicit importer and one request context for route data", async () => {
  const app = defineApp({
    shell,
    routing: { basename: "/app", dataPath: "/__data" },
    routes: [route("/articles/:slug", "/src/Article.tsrx")],
  })
  const contexts: unknown[] = []
  const runtime = createRouteRuntime({
    app,
    importRoute: async (entry) => ({
      default: entry,
      loader: ({ request, params, context }) => ({
        pathname: new URL(request.url).pathname,
        slug: params.slug,
        context,
      }),
    }),
    requestContext: async (input) => {
      const context = {
        url: input.request.url,
        purpose: input.purpose,
        ...(input.mode === undefined ? {} : { mode: input.mode }),
        route: input.route?.path,
      }

      contexts.push(context)
      return context
    },
  })

  const request = new Request("https://example.test/app/articles/hello")
  const loaded = await runtime.loadRoute(request)

  assert.deepEqual(loaded?.loaderData, {
    pathname: "/app/articles/hello",
    slug: "hello",
    context: {
      url: request.url,
      purpose: "data",
      route: "/articles/:slug",
    },
  })
  assert.equal(contexts.length, 1)
  assert.equal(
    app.match("/app/articles/hello")?.data.entry,
    "/src/Article.tsrx",
  )
  assert.equal(app.match("/articles/hello"), null)

  const endpoint = new URL("https://example.test/__data")

  endpoint.searchParams.set("url", request.url)
  const response = await runtime.loadRouteData(new Request(endpoint))

  assert.deepEqual(await response.json(), {
    pathname: "/app/articles/hello",
    slug: "hello",
    context: {
      url: request.url,
      purpose: "data",
      route: "/articles/:slug",
    },
  })
  assert.equal(contexts.length, 2)
})

test("does not import an unmatched route", async () => {
  const app = defineApp({
    shell,
    routes: [route("/known", "/src/Known.tsrx")],
  })
  const runtime = createRouteRuntime({
    app,
    importRoute: async () => {
      throw new Error("unmatched routes must not be imported")
    },
  })

  assert.equal(
    await runtime.loadRoute(new Request("https://example.test/unknown")),
    null,
  )
  assert.equal(
    (
      await runtime.loadRouteData(
        new Request(
          "https://example.test/__flamefront/data?url=https%3A%2F%2Fexample.test%2Funknown",
        ),
      )
    ).status,
    404,
  )
})

test("runs page actions through the action request boundary", async () => {
  const app = defineApp({
    shell,
    routes: [route("/products/:id", "/src/Product.tsrx")],
  })
  const runtime = createRouteRuntime({
    app,
    importRoute: async () => ({
      default: "Product",
      action: async ({ request, params }) => ({
        id: params.id,
        method: request.method,
        url: request.url,
        form: Object.fromEntries(await request.formData()),
      }),
    }),
  })

  const response = await runtime.loadAction(
    new Request("https://example.test/products/42?__flamefront_action=1", {
      method: "POST",
      body: new URLSearchParams({ name: "New name" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }),
  )
  const envelope = devalue.parse(await response.text()) as {
    readonly type: string
    readonly value: unknown
  }

  assert.equal(response.status, 200)
  assert.equal(envelope.type, "data")
  assert.deepEqual(envelope.value, {
    id: "42",
    method: "POST",
    url: "https://example.test/products/42",
    form: { name: "New name" },
  })
})

test("blocks cross-origin page actions", async () => {
  const app = defineApp({
    shell,
    routes: [route("/products", "/src/Product.tsrx")],
  })
  const runtime = createRouteRuntime({
    app,
    importRoute: async () => ({
      default: "Product",
      action: () => ({ saved: true }),
    }),
  })

  const response = await runtime.loadAction(
    new Request("https://example.test/products", {
      method: "POST",
      headers: { Origin: "https://evil.test" },
    }),
  )

  assert.equal(response.status, 403)
})

test("does not dispatch actions owned by static routes", async () => {
  const app = defineApp({
    shell,
    routes: [route("/built", "/src/Built.tsrx", { render: "static" })],
  })
  let imported = false
  const runtime = createRouteRuntime({
    app,
    importRoute: async () => {
      imported = true
      return { default: null, action: () => ({ saved: true }) }
    },
  })

  const response = await runtime.loadAction(
    new Request("https://example.test/built", { method: "POST" }),
  )

  assert.equal(response.status, 405)
  assert.match(await response.text(), /static routes cannot define actions/i)
  assert.equal(imported, false)
})

test("loads generated action modules before the first direct call", async () => {
  const app = defineApp({
    shell,
    routes: [route("/", "/src/Index.tsrx")],
  })
  const importRoute = Object.assign(async () => ({ default: null }), {
    loadActions: async () => {
      action("lazy-action", (value) => Number(value) + 1)
    },
  })
  const runtime = createRouteRuntime({ app, importRoute })
  const response = await runtime.loadAction(
    new Request("https://example.test/__flamefront/data?action=lazy-action", {
      method: "POST",
      body: devalue.stringify([41]),
    }),
  )
  const envelope = devalue.parse(await response.text()) as {
    readonly value: unknown
  }

  assert.equal(envelope.value, 42)
})
