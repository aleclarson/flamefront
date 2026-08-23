import assert from "node:assert/strict"
import test from "node:test"
import { defineApp, route } from "../src/index.ts"
import {
  createRoutePrefetchCallback,
  prefetchRouteResources,
} from "../src/route-prefetch.ts"

const shell = "/src/AppShell.tsrx"

test("live route prefetch warms data and client modules", async () => {
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
    "/server",
  )

  assert.deepEqual(prefetched, ["/client", "/server"])
  assert.deepEqual(loadedModules, ["/src/Client.tsrx", "/src/Server.tsrx"])
})

test("static route prefetch uses the fragment seam without loading its module", async () => {
  const app = defineApp({
    shell,
    routes: [
      route("/static", "/src/Static.tsrx", {
        render: "static",
        hydration: { when: "visible" },
      }),
    ],
  })
  const prefetched: string[] = []
  const loadedModules: string[] = []
  let fragmentRoute = ""

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
      staticFragment: async (url, routeDefinition) => {
        fragmentRoute = `${String(url)}:${JSON.stringify(routeDefinition.hydration)}`
      },
    },
  )

  assert.equal(fragmentRoute, '/static:{"when":"visible"}')
  assert.deepEqual(prefetched, [])
  assert.deepEqual(loadedModules, [])
})
