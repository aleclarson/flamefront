import assert from "node:assert/strict"
import test from "node:test"
import {
  getRouteFragment,
  loadRouteFragment,
  prefetchRouteFragment,
  shouldHydrateRouteFragment,
} from "../src/fragment-client.ts"
import { withRouteFragmentProtocol } from "../src/fragment-protocol.ts"

test("marks fragment requests without leaking reserved protocol parameters", () => {
  const endpoint = withRouteFragmentProtocol(
    "https://example.test/about?view=full&__flamefront_shell=1",
  )

  assert.equal(endpoint.pathname, "/about")
  assert.equal(endpoint.searchParams.get("view"), "full")
  assert.equal(endpoint.searchParams.get("__flamefront_fragment"), "1")
  assert.equal(endpoint.searchParams.has("__flamefront_shell"), false)
})

test("keeps static fragments cached by origin and pathname", async (context) => {
  const originalFetch = globalThis.fetch
  let requests = 0

  context.after(() => {
    globalThis.fetch = originalFetch
  })

  globalThis.fetch = async (input) => {
    requests += 1
    const endpoint = new URL(String(input))

    assert.equal(endpoint.pathname, "/about")
    assert.equal(endpoint.searchParams.get("view"), "full")
    assert.equal(endpoint.searchParams.get("__flamefront_fragment"), "1")
    return Response.json({
      protocol: "flamefront-route-fragment-v1",
      route: "/about",
      boundary: "flamefront:route:about",
      html: "<main>built</main>",
      routeData: { source: "fragment" },
      boundaries: [],
    })
  }

  const url = "https://example.test/about?view=full"
  const artifact = await loadRouteFragment(url, {}, { policy: "static" })

  assert.equal(artifact.html, "<main>built</main>")
  assert.deepEqual(getRouteFragment(url)?.routeData, { source: "fragment" })
  await prefetchRouteFragment(url, "static")
  await loadRouteFragment(
    "https://example.test/about?view=compact",
    {},
    { policy: "static" },
  )
  assert.equal(requests, 1)
})

test("coalesces server fragments by full URL and reloads after settlement", async (context) => {
  const originalFetch = globalThis.fetch
  let requests = 0

  context.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (input) => {
    requests += 1
    const endpoint = new URL(String(input))
    const view = endpoint.searchParams.get("view")

    await Promise.resolve()
    return Response.json({
      protocol: "flamefront-route-fragment-v1",
      route: "/live",
      boundary: "live",
      html: `<main>${view}:${requests}</main>`,
      routeData: { view, requests },
      boundaries: [],
    })
  }

  const full = "https://example.test/live?view=full"
  const [first, duplicate] = await Promise.all([
    loadRouteFragment(full, {}, { policy: "server" }),
    loadRouteFragment(full, {}, { policy: "server" }),
  ])

  assert.equal(requests, 1)
  assert.deepEqual(duplicate, first)
  assert.equal(getRouteFragment(full)?.html, "<main>full:1</main>")

  await loadRouteFragment(full, {}, { policy: "server" })
  await loadRouteFragment(
    "https://example.test/live?view=compact",
    {},
    { policy: "server" },
  )
  assert.equal(requests, 3)
})

test("evicts failed and aborted server fragment requests", async (context) => {
  const originalFetch = globalThis.fetch
  let requests = 0

  context.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (_input, init) => {
    requests += 1
    if (requests === 1) {
      return new Response("Unavailable", { status: 503 })
    }

    if (requests === 2) {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          {
            once: true,
          },
        )
      })
    }

    return Response.json({
      protocol: "flamefront-route-fragment-v1",
      route: "/retry",
      boundary: "retry",
      html: "<main>recovered</main>",
      routeData: null,
      boundaries: [],
    })
  }

  const url = "https://example.test/retry"

  await assert.rejects(
    loadRouteFragment(url, {}, { policy: "server" }),
    /failed with 503/,
  )

  const controller = new AbortController()
  const aborted = loadRouteFragment(
    url,
    {},
    {
      policy: "server",
      signal: controller.signal,
    },
  )

  controller.abort(new DOMException("Navigation aborted", "AbortError"))
  await assert.rejects(aborted, { name: "AbortError" })

  const recovered = await loadRouteFragment(url, {}, { policy: "server" })

  assert.equal(recovered.html, "<main>recovered</main>")
  assert.equal(requests, 3)
})

test("only hydration policies other than none activate post-insertion hydration", () => {
  assert.equal(shouldHydrateRouteFragment("none"), false)
  assert.equal(shouldHydrateRouteFragment("full"), true)
  assert.equal(shouldHydrateRouteFragment("deferred"), true)
  assert.equal(shouldHydrateRouteFragment({ when: "idle" }), true)
})
