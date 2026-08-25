import assert from "node:assert/strict"
import test from "node:test"
import { defineApp, route } from "../src/index.ts"
import {
  createRoutePrefetchCallback,
  prefetchRouteResources,
} from "../src/route-prefetch.ts"

const shell = "/src/AppShell.tsrx"

test("client route prefetch warms data and its module", async () => {
  const app = defineApp({
    shell,
    routes: [
      route("/client", "/src/Client.tsrx", { render: "client" }),
      route("/server", "/src/Server.tsrx", { render: "server" }),
    ],
  })
  const prefetched: string[] = []
  const loadedModules: string[] = []
  const callback = createRoutePrefetchCallback(
    {
      match: app.match,
      prefetch: async (url) => {
        prefetched.push(String(url))
      },
    },
    async (entry) => {
      loadedModules.push(entry)
    },
  )

  await callback("/client")
  assert.deepEqual(prefetched, ["/client"])
  assert.deepEqual(loadedModules, ["/src/Client.tsrx"])
})

test("server and static route prefetch use the fragment seam", async () => {
  const app = defineApp({
    shell,
    routes: [
      route("/static", "/src/Static.tsrx", {
        render: "static",
        hydration: { when: "visible" },
      }),
      route("/server", "/src/Server.tsrx", { render: "server" }),
    ],
  })
  const prefetched: string[] = []
  const loadedModules: string[] = []
  const fragmentRoutes: string[] = []

  await prefetchRouteResources(
    {
      match: app.match,
      prefetch: async (url) => {
        prefetched.push(String(url))
      },
    },
    async (entry) => {
      loadedModules.push(entry)
    },
    "/static",
    {},
    {
      routeFragment: async (url, routeDefinition) => {
        fragmentRoutes.push(
          `${String(url)}:${routeDefinition.render}:${JSON.stringify(routeDefinition.hydration)}`,
        )
      },
    },
  )

  await prefetchRouteResources(
    { match: app.match, prefetch: async () => {} },
    async () => {},
    "/server",
    {},
    {
      routeFragment: async (url, routeDefinition) => {
        fragmentRoutes.push(`${String(url)}:${routeDefinition.render}`)
      },
    },
  )

  assert.deepEqual(fragmentRoutes, [
    '/static:static:{"when":"visible"}',
    "/server:server",
  ])
  assert.deepEqual(prefetched, [])
  assert.deepEqual(loadedModules, [])
})
