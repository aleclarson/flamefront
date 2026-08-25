import assert from "node:assert/strict"
import { onTestFinished, test } from "vitest"
import {
  loadRouteData,
  loadStaticRouteData,
  loadRouteFragment,
} from "../src/remix-route-data.ts"

test("loads browser route data using the request URL and abort signal", async () => {
  const originalFetch = globalThis.fetch

  onTestFinished(() => {
    globalThis.fetch = originalFetch
  })
  const controller = new AbortController()
  const request = new Request("https://example.test/items/one?view=full", {
    signal: controller.signal,
  })

  globalThis.fetch = async (input, init) => {
    const endpoint = new URL(String(input))

    assert.equal(endpoint.pathname, "/__flamefront/data")
    assert.equal(
      endpoint.searchParams.get("url"),
      "https://example.test/items/one?view=full",
    )
    assert.equal(init?.signal, request.signal)
    return Response.json({ message: "loaded" })
  }

  assert.deepEqual(await loadRouteData({ request }), { message: "loaded" })
})

test("uses the app routing data path for browser route data", async () => {
  const originalFetch = globalThis.fetch

  onTestFinished(() => {
    globalThis.fetch = originalFetch
  })
  const request = new Request("https://example.test/docs/items/one")

  globalThis.fetch = async (input) => {
    const endpoint = new URL(String(input))

    assert.equal(endpoint.pathname, "/docs/__data")
    return Response.json({ message: "loaded" })
  }

  assert.deepEqual(
    await loadRouteData(
      { request },
      { basename: "/docs", dataPath: "/docs/__data" },
    ),
    { message: "loaded" },
  )
})

test("reports unsuccessful browser route-data responses", async () => {
  const originalFetch = globalThis.fetch

  onTestFinished(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async () => new Response("Unavailable", { status: 503 })

  await assert.rejects(
    loadRouteData({ request: new Request("https://example.test/items/one") }),
    /flamefront loader request failed with 503/,
  )
})

test("loads static route data from the generated artifact beside the document", async () => {
  const originalFetch = globalThis.fetch

  onTestFinished(() => {
    globalThis.fetch = originalFetch
  })
  const request = new Request("https://example.test/about?view=full")

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://example.test/about/index.data.json")
    assert.equal(init?.signal, request.signal)
    return Response.json({ message: "built" })
  }

  assert.deepEqual(await loadStaticRouteData({ request }), { message: "built" })
})

test("strips the shared basename from static route-data artifacts", async () => {
  const originalFetch = globalThis.fetch

  onTestFinished(() => {
    globalThis.fetch = originalFetch
  })
  const request = new Request("https://example.test/docs/about")

  globalThis.fetch = async (input) => {
    assert.equal(
      String(input),
      "https://example.test/docs/about/index.data.json",
    )
    return Response.json({ message: "built" })
  }

  assert.deepEqual(
    await loadStaticRouteData({ request }, { basename: "/docs" }),
    {
      message: "built",
    },
  )
})

test("reports unsuccessful static route-data responses", async () => {
  const originalFetch = globalThis.fetch

  onTestFinished(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async () => new Response("Unavailable", { status: 404 })

  await assert.rejects(
    loadStaticRouteData({ request: new Request("https://example.test/about") }),
    /flamefront static route data request failed with 404/,
  )
})

test("loads static navigation fragments while returning only route data", async () => {
  const originalFetch = globalThis.fetch

  onTestFinished(() => {
    globalThis.fetch = originalFetch
  })
  const request = new Request("https://example.test/about?view=full")

  globalThis.fetch = async (input, init) => {
    const endpoint = new URL(String(input))

    assert.equal(endpoint.pathname, "/about")
    assert.equal(endpoint.searchParams.get("view"), "full")
    assert.equal(endpoint.searchParams.get("__flamefront_fragment"), "1")
    assert.equal(
      new Headers(init?.headers).get("accept"),
      "application/vnd.flamefront.fragment+json",
    )
    return Response.json({
      protocol: "flamefront-route-fragment-v1",
      route: "/about",
      boundary: "flamefront:route:about",
      html: "<main>built</main>",
      routeData: { source: "fragment" },
      boundaries: [],
    })
  }

  assert.deepEqual(await loadRouteFragment({ request }), {
    source: "fragment",
  })
})

test("propagates browser route-data aborts", async () => {
  const originalFetch = globalThis.fetch

  onTestFinished(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (_input, init) => {
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

  const controller = new AbortController()
  const pending = loadRouteData({
    request: new Request("https://example.test/items/one", {
      signal: controller.signal,
    }),
  })

  controller.abort(new DOMException("Navigation aborted", "AbortError"))

  await assert.rejects(pending, { name: "AbortError" })
})
