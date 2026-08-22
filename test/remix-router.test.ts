import assert from "node:assert/strict"
import test from "node:test"
import {
  createRemixRouterAdapter,
  type RemixStaticContext,
} from "../src/remix-router-core.ts"

interface TestRoute {
  readonly path: string
  readonly result: Response | RemixStaticContext
}

function createRuntime() {
  let routerSequence = 0

  return {
    createBrowserRouter(
      routes: TestRoute[],
      options?: { hydrationData?: unknown },
    ) {
      return { kind: "browser", routes, options, id: ++routerSequence }
    },
    createStaticHandler(routes: TestRoute[]) {
      return {
        dataRoutes: routes,
        async query(request: Request) {
          const route = routes.find(
            ({ path }) => new URL(request.url).pathname === path,
          )

          return route?.result ?? new Response("Not found", { status: 404 })
        },
      }
    },
    createStaticRouter(routes: TestRoute[], context: RemixStaticContext) {
      return { kind: "static", routes, context, id: ++routerSequence }
    },
  }
}

test("creates request-scoped routers and exposes loader hydration state", async () => {
  const context = {
    loaderData: { item: { id: "one" } },
    actionData: null,
    errors: null,
  }
  const routes: TestRoute[] = [{ path: "/items/one", result: context }]
  const adapter = createRemixRouterAdapter(routes, createRuntime())
  const first = await adapter.createServerRouter(
    new Request("https://example.test/items/one"),
  )
  const second = await adapter.createServerRouter(
    new Request("https://example.test/items/one"),
  )

  assert.equal(first instanceof Response, false)
  assert.equal(second instanceof Response, false)
  if (first instanceof Response || second instanceof Response) {
    return
  }

  assert.deepEqual(first.hydrationData.loaderData, { item: { id: "one" } })
  assert.notEqual(first.router, second.router)
  assert.equal(adapter.routes, routes)
  assert.equal(
    adapter.createClientRouter({ hydrationData: first.hydrationData }).kind,
    "browser",
  )
})

test("returns redirect Responses from static routing unchanged", async () => {
  const redirect = new Response(null, {
    status: 302,
    headers: { Location: "/new" },
  })
  const adapter = createRemixRouterAdapter(
    [{ path: "/old", result: redirect }],
    createRuntime(),
  )
  const result = await adapter.createServerRouter(
    new Request("https://example.test/old"),
  )

  assert.equal(result, redirect)
})

test("retains static route errors in client hydration state", async () => {
  const error = new Response("Missing", { status: 404 })
  const context = {
    loaderData: {},
    actionData: null,
    errors: { broken: error },
    statusCode: 404,
  }
  const adapter = createRemixRouterAdapter(
    [{ path: "/broken", result: context }],
    createRuntime(),
  )
  const result = await adapter.createServerRouter(
    new Request("https://example.test/broken"),
  )

  assert.equal(result instanceof Response, false)
  if (result instanceof Response) {
    return
  }

  assert.equal(result.context.statusCode, 404)
  assert.equal(result.hydrationData.errors, result.context.errors)
})
