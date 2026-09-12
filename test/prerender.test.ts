import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { test } from "vitest"
import { route } from "../src/index.ts"
import {
  prerenderStaticRouteEntries,
  type PrerenderRouteEntry,
} from "../src/lifecycle.ts"
import {
  assembleStaticRouteArtifact,
  templateFingerprint,
} from "../src/prerender-artifacts.ts"
import type { PrerenderCache } from "../src/prerender.ts"

function memoryCache(): PrerenderCache {
  const values = new Map<string, Uint8Array>()

  return {
    async get(key) {
      return values.get(key) ?? null
    },
    async put(key, value) {
      values.set(key, value)
    },
  }
}

test("reuses a cached route artifact when its key and fingerprint match", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "flamefront-cache-"))
  const clientDirectory = resolve(root, "dist/client")
  const cache = memoryCache()
  const page = route("/posts/:slug", "/src/Post.tsrx", { render: "static" })
  const entries: readonly PrerenderRouteEntry[] = [
    { path: "/posts/hello", route: page, key: "post-v1" },
  ]
  let renders = 0

  try {
    const render = async (request: Request) => {
      renders += 1
      return `<main>${new URL(request.url).pathname}</main>`
    }

    const first = await prerenderStaticRouteEntries(
      root,
      clientDirectory,
      entries,
      render,
      undefined,
      undefined,
      undefined,
      { cache, fingerprint: () => "renderer-v1" },
    )
    const second = await prerenderStaticRouteEntries(
      root,
      clientDirectory,
      entries,
      render,
      undefined,
      undefined,
      undefined,
      { cache, fingerprint: () => "renderer-v1" },
    )

    assert.deepEqual(first, { rendered: 1, reused: 0 })
    assert.deepEqual(second, { rendered: 0, reused: 1 })
    assert.equal(renders, 1)
    assert.equal(
      await readFile(
        resolve(clientDirectory, "posts/hello/index.html"),
        "utf8",
      ),
      "<main>/posts/hello</main>",
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("force rerender bypasses reads while refreshing the cache", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "flamefront-cache-"))
  const clientDirectory = resolve(root, "dist/client")
  const cache = memoryCache()
  const page = route("/about", "/src/About.tsrx", { render: "static" })
  const entries: readonly PrerenderRouteEntry[] = [
    { path: "/about", route: page, key: "about-v1" },
  ]
  let renders = 0

  try {
    const render = async () => {
      renders += 1
      return `<main>${renders}</main>`
    }

    await prerenderStaticRouteEntries(
      root,
      clientDirectory,
      entries,
      render,
      undefined,
      undefined,
      undefined,
      { cache, fingerprint: () => "renderer-v1" },
    )
    await prerenderStaticRouteEntries(
      root,
      clientDirectory,
      entries,
      render,
      undefined,
      undefined,
      undefined,
      { cache, force: true, fingerprint: () => "renderer-v1" },
    )

    assert.equal(renders, 2)
    assert.equal(
      await readFile(resolve(clientDirectory, "about/index.html"), "utf8"),
      "<main>2</main>",
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("reassembles changed asset names without rerendering document content", () => {
  const oldTemplate =
    '<script src="/assets/app-old.js"></script><div id="root"></div>'
  const newTemplate =
    '<script src="/assets/app-new.js"></script><div id="root"></div>'
  const artifact = {
    html: '<script src="/assets/app-old.js"></script><main>cached</main>',
    routeData: null,
    fragment: {
      protocol: "flamefront-route-fragment-v1" as const,
      route: "/about",
      boundary: "about",
      html: "<main>cached</main>",
      routeData: null,
      boundaries: [],
    },
    status: 200,
    template: {
      fingerprint: templateFingerprint(oldTemplate),
      assets: ["/assets/app-old.js"],
    },
  }

  assert.equal(
    assembleStaticRouteArtifact(artifact, newTemplate)?.html,
    '<script src="/assets/app-new.js"></script><main>cached</main>',
  )
  assert.equal(
    assembleStaticRouteArtifact(
      artifact,
      newTemplate.replace("root", "outlet"),
    ),
    null,
  )
})
