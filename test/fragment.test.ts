import assert from "node:assert/strict"
import test from "node:test"
import {
  getStaticFragment,
  loadStaticFragment,
  prefetchStaticFragment,
  shouldHydrateStaticFragment,
} from "../src/fragment-client.ts"
import { withStaticFragmentProtocol } from "../src/fragment-protocol.ts"

test("marks fragment requests without leaking reserved protocol parameters", () => {
  const endpoint = withStaticFragmentProtocol(
    "https://example.test/about?view=full&__flamefront_shell=1",
  )

  assert.equal(endpoint.pathname, "/about")
  assert.equal(endpoint.searchParams.get("view"), "full")
  assert.equal(endpoint.searchParams.get("__flamefront_fragment"), "1")
  assert.equal(endpoint.searchParams.has("__flamefront_shell"), false)
})

test("loads and caches a static fragment artifact independently of route data", async (context) => {
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
      protocol: "flamefront-static-fragment-v1",
      route: "/about",
      boundary: "flamefront:route:about",
      html: "<main>built</main>",
      routeData: { source: "fragment" },
      boundaries: [],
    })
  }

  const url = "https://example.test/about?view=full"
  const artifact = await loadStaticFragment(url)

  assert.equal(artifact.html, "<main>built</main>")
  assert.deepEqual(getStaticFragment(url)?.routeData, { source: "fragment" })
  await prefetchStaticFragment(url)
  assert.equal(requests, 1)
})

test("only hydration policies other than none activate post-insertion hydration", () => {
  assert.equal(shouldHydrateStaticFragment("none"), false)
  assert.equal(shouldHydrateStaticFragment("full"), true)
  assert.equal(shouldHydrateStaticFragment("deferred"), true)
  assert.equal(shouldHydrateStaticFragment({ when: "idle" }), true)
})
