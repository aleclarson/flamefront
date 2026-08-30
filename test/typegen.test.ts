import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "vitest"
import { defineApp, route } from "../src/index.ts"
import {
  flamefrontTypesDirectory,
  generateProjectTypes,
  markdownModuleTypesFile,
  generateRouteImportMap,
  routeImportMapFile,
} from "../src/typegen.ts"
import { flamefront } from "../src/vite.ts"

test("generates only a declaration-only route import map", () => {
  const app = defineApp({
    shell: "/src/AppShell.tsrx",
    routes: [
      route("/products/:productId", "/src/ProductPage.tsrx"),
      route("/about", "/src/AboutPage.tsrx", { render: "static" }),
    ],
  })

  const source = generateRouteImportMap(app, { root: "/project" })

  assert.match(source, /declare module "flamefront"/)
  assert.match(
    source,
    /"\/products\/:productId": typeof import\("\.\.\/\.\.\/src\/ProductPage\.tsrx"\)/,
  )
  assert.match(
    source,
    /"\/about": typeof import\("\.\.\/\.\.\/src\/AboutPage\.tsrx"\)/,
  )
  assert.match(source, /export \{\}/)
  assert.doesNotMatch(source, /render|hydration|routeTree/)
  assert.doesNotMatch(source, /entry:/)
})

test("evaluates a project manifest and writes stable declarations", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "flamefront-typegen-"))

  try {
    await mkdir(path.join(root, "src"))
    await writeFile(
      path.join(root, "src/app.ts"),
      `export const app = {
  shell: "/src/AppShell.tsrx",
  routes: [{ path: "/one", entry: "/src/One.tsrx", render: "server" }],
}
`,
    )

    const first = await generateProjectTypes({ root })
    const second = await generateProjectTypes({ root })
    const generated = await readFile(first.file, "utf8")
    const generatedMarkdownTypes = await readFile(
      path.join(root, flamefrontTypesDirectory, markdownModuleTypesFile),
      "utf8",
    )

    assert.equal(
      first.file,
      path.join(root, flamefrontTypesDirectory, routeImportMapFile),
    )
    assert.equal(first.written, true)
    assert.equal(second.written, false)
    assert.equal(generated, first.source)
    assert.match(generated, /typeof import\("\.\.\/\.\.\/src\/One\.tsrx"\)/)
    assert.match(generatedMarkdownTypes, /declare module "\*\.md"/)
    assert.match(generatedMarkdownTypes, /declare module "\*\.mdx"/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("Vite generates at startup and refreshes declarations after manifest HMR", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "flamefront-vite-typegen-"))

  try {
    await mkdir(path.join(root, "src"))

    const manifest = path.join(root, "src/app.ts")

    await writeFile(
      manifest,
      `export const app = {
  shell: "/src/AppShell.tsrx",
  routeTree: [],
  routes: [{ path: "/one", entry: "/src/One.tsrx", render: "server" }],
}
`,
    )

    const [frameworkPlugin] = flamefront()

    frameworkPlugin.configResolved({ root })

    await frameworkPlugin.buildStart()

    const generatedFile = path.join(
      root,
      flamefrontTypesDirectory,
      routeImportMapFile,
    )
    const first = await readFile(generatedFile, "utf8")

    await writeFile(
      manifest,
      `export const app = {
  shell: "/src/AppShell.tsrx",
  routeTree: [],
  routes: [{ path: "/two", entry: "/src/Two.tsrx", render: "server" }],
}
`,
    )
    await frameworkPlugin.handleHotUpdate({
      file: manifest,
      server: {
        moduleGraph: {
          getModuleById: () => undefined,
          invalidateModule: () => undefined,
        },
      },
    })

    const second = await readFile(generatedFile, "utf8")

    assert.match(first, /"\/one": typeof import/)
    assert.match(second, /"\/two": typeof import/)
    assert.doesNotMatch(second, /"\/one": typeof import/)

    await writeFile(manifest, "export const app = {")
    await assert.doesNotReject(
      frameworkPlugin.handleHotUpdate({
        file: manifest,
        server: {
          moduleGraph: {
            getModuleById: () => undefined,
            invalidateModule: () => undefined,
          },
        },
      }),
    )
    assert.equal(await readFile(generatedFile, "utf8"), second)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
