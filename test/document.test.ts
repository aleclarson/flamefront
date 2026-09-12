import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "vitest"
import { documentAssets } from "../src/document-assets.ts"
import { readProjectTemplate } from "../src/document-template.ts"
import { defineApp, route } from "../src/index.ts"
import { generateRemixRoutes } from "../src/vite.ts"
import { renderingFingerprint } from "../src/prerender.ts"

test("preserves Vite assets without importing template metadata or inert markup", () => {
  const assets = documentAssets(
    `<!doctype html><html><head>
    <title>Old document</title><meta name="description" content="old">
    <!-- <script src="comment.js"></script> -->
    <template><script src="inert.js"></script></template>
    <link rel="stylesheet" href="/assets/main.css?v=1&amp;x=2" crossorigin>
    <style media="screen">body { color: red }</style>
    </head><body>
    <script type="module" src="/assets/main.js" nonce="test-nonce"></script>
    <script>window.example = '<link href="fake.css">';</script>
    </body></html>`,
    '<script id="hydration">window.data = {};</script>',
  )

  assert.deepEqual(
    assets.head.map((asset) => asset.tag),
    ["link", "style"],
  )
  assert.equal(assets.head[0].attributes.href, "/assets/main.css?v=1&x=2")
  assert.equal(assets.head[0].attributes.crossorigin, "")
  assert.equal(assets.head[1].content, "body { color: red }")
  assert.equal(assets.scripts.length, 3)
  assert.equal(assets.scripts[0].attributes.nonce, "test-nonce")
  assert.equal(
    assets.scripts[1].content,
    `window.example = '<link href="fake.css">';`,
  )
  assert.equal(assets.scripts[2].attributes.id, "hydration")
})

test("only synthesizes a missing Vite HTML entry for document apps", async () => {
  const root = await mkdtemp(join(tmpdir(), "flamefront-document-"))

  try {
    await assert.rejects(readProjectTemplate(root, false), { code: "ENOENT" })
    assert.match(await readProjectTemplate(root, true), /src="\/src\/main.ts"/)
    await writeFile(
      join(root, "index.html"),
      '<script type="module" src="/custom.ts"></script>',
    )
    assert.equal(
      await readProjectTemplate(root, true),
      '<script type="module" src="/custom.ts"></script>',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("validates and generates the optional document outside the shell boundary", () => {
  const options = {
    shell: "/src/Shell.tsrx",
    routes: [route("/", "/src/Page.tsrx")],
  }

  assert.throws(() => defineApp({ ...options, document: "" }), /document entry/)
  const app = defineApp({ ...options, document: "/src/Document.tsrx" })
  const generated = generateRemixRoutes(app)

  assert.match(generated, /import Document from "\/src\/Document.tsrx"/)
  assert.match(
    generated,
    /Component: createDocumentShell\(Document, createRouteBoundary\(Shell,/,
  )
  assert.doesNotMatch(
    generateRemixRoutes(defineApp(options)),
    /createDocumentShell/,
  )
})

test("invalidates prerendered pages when their document changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "flamefront-document-cache-"))
  const page = route("/", "/Page.ts", { render: "static" })
  const app = defineApp({
    document: "/Document.ts",
    shell: "/Shell.ts",
    routes: [page],
  })

  try {
    await writeFile(join(root, "Document.ts"), 'export default "before"')
    const before = await renderingFingerprint(root, app, page, "/")

    await writeFile(join(root, "Document.ts"), 'export default "after"')
    assert.notEqual(await renderingFingerprint(root, app, page, "/"), before)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
