import assert from "node:assert/strict"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

const routerSource = fileURLToPath(
  new URL(
    "../../node_modules/@octanejs/remix-router/src/lib/router/router.ts",
    import.meta.url,
  ),
)
const historySource = fileURLToPath(
  new URL(
    "../../node_modules/@octanejs/remix-router/src/lib/router/history.ts",
    import.meta.url,
  ),
)

async function loadRouterModules() {
  const server = await createServer({
    root: fileURLToPath(new URL("../../", import.meta.url)),
    logLevel: "error",
  })

  try {
    return {
      router: await server.ssrLoadModule(routerSource),
      history: await server.ssrLoadModule(historySource),
    }
  } finally {
    await server.close()
  }
}

test("prefetch resolves against the router context and deduplicates warmed paths", async () => {
  const { router: routerModule, history: historyModule } =
    await loadRouterModules()
  const prefetched: string[] = []
  const history = historyModule.createMemoryHistory({
    initialEntries: ["/app/products/one"],
  })
  const router = routerModule
    .createRouter({
      basename: "/app",
      history,
      routes: [
        {
          id: "root",
          path: "/",
          children: [{ id: "product", path: "products/:id" }],
        },
      ],
      prefetch: (to: string) => {
        prefetched.push(to)
      },
    })
    .initialize()

  await Promise.all([
    router.prefetch("/products/one"),
    router.prefetch("/products/one"),
  ])

  assert.deepEqual(prefetched, ["/app/products/one"])

  await router.prefetch("..", { fromRouteId: "product" })
  assert.deepEqual(prefetched, ["/app/products/one", "/app"])
})

test("a failed prefetch can be retried without affecting navigation", async () => {
  const { router: routerModule, history: historyModule } =
    await loadRouterModules()
  const prefetched: string[] = []
  let fail = true
  const history = historyModule.createMemoryHistory({ initialEntries: ["/"] })
  const router = routerModule
    .createRouter({
      history,
      routes: [{ id: "root", path: "/" }],
      prefetch: async (to: string) => {
        prefetched.push(to)
        if (fail) {
          throw new Error("prefetch failed")
        }
      },
    })
    .initialize()

  await assert.rejects(router.prefetch("/target"), /prefetch failed/)
  fail = false
  await router.prefetch("/target")
  await router.navigate("/target")

  assert.deepEqual(prefetched, ["/target", "/target"])
  assert.equal(router.state.location.pathname, "/target")
})
