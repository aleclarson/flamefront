import assert from "node:assert/strict"
import test from "node:test"
import { defineApp, route } from "../src/index.ts"
import {
  createOctaneDocuments,
  type DocumentRouter,
  type OctaneRenderer,
} from "../src/octane.tsx"
import { createRouteRuntime } from "../src/server.ts"

const shell = "/src/AppShell.tsrx"

function createTestRenderer(): OctaneRenderer {
  return {
    createStaticRouter: (routes, context) => ({
      kind: "shell",
      routes,
      context,
    }),
    renderToString: (_component, props) => ({
      html: `<article>${String((props.context as { statusCode?: number }).statusCode ?? 0)}</article>`,
      css: "<style data-test>body{color:red}</style>",
    }),
    defaultRouterDocument: () => null,
  }
}

test("passes one document context to the server router and composer", async () => {
  const app = defineApp({
    shell,
    routes: [route("/docs", "/src/Docs.tsrx", { render: "server" })],
  })
  const contexts: unknown[] = []
  const runtime = createRouteRuntime({
    app,
    importRoute: async () => ({ default: null }),
    requestContext: (input) => {
      const context = {
        token: "request-scoped",
        purpose: input.purpose,
        mode: input.mode,
      }

      contexts.push(context)
      return context
    },
  })
  let routerContext: unknown
  const context = {
    loaderData: { docs: { title: "Docs" } },
    actionData: null,
    errors: null,
    statusCode: 201,
    matches: [{ route: { id: "docs" } }],
  }
  const router: DocumentRouter = {
    routes: [{ id: "root" }],
    async createServerRouter(_request, options) {
      routerContext = options?.requestContext
      return {
        context,
        hydrationData: {
          loaderData: context.loaderData,
          actionData: context.actionData,
          errors: context.errors,
        },
        router: { kind: "server" },
      }
    },
  }
  let composedParts:
    { body: string; css: string; hydrationScript: string } | undefined
  let composedMode: string | undefined
  const documents = createOctaneDocuments({
    app,
    runtime,
    router,
    renderer: createTestRenderer(),
    routerDocument: ({ router: documentRouter }) => ({ documentRouter }),
    composeDocument: (parts, metadata) => {
      composedParts = {
        body: parts.body,
        css: parts.css,
        hydrationScript: parts.hydrationScript,
      }
      composedMode = metadata.mode
      return `<html>${parts.body}${parts.hydrationScript}</html>`
    },
  })

  const rendered = await documents.renderDocument(
    '<html><head></head><body><div id="root"></div></body></html>',
    new Request("https://example.test/docs"),
  )

  assert.equal(contexts.length, 1)
  assert.equal(routerContext, contexts[0])
  assert.deepEqual(contexts[0], {
    token: "request-scoped",
    purpose: "document",
    mode: "server",
  })
  assert.equal(composedMode, "server")
  assert.match(composedParts?.body ?? "", /<article>201<\/article>/)
  assert.match(composedParts?.css ?? "", /data-test/)
  assert.match(
    composedParts?.hydrationScript ?? "",
    /flamefront-static-router-hydration/,
  )
  assert.equal(rendered.status, 201)
  assert.equal(rendered.routeData, undefined)
  assert.match(rendered.html, /<html>/)
})

test("supports explicit shell mode and preserves static route data extraction", async () => {
  const app = defineApp({
    shell,
    routes: [
      route("/client", "/src/Client.tsrx", { render: "client" }),
      route("/built", "/src/Built.tsrx", { render: "static" }),
    ],
  })
  const runtime = createRouteRuntime({
    app,
    importRoute: async () => ({ default: null }),
  })
  const serverContext = {
    loaderData: { built: { value: 42 } },
    actionData: null,
    errors: null,
    statusCode: 200,
    matches: [{ route: { id: "built" } }],
  }
  const router: DocumentRouter = {
    routes: [{ id: "root" }],
    async createServerRouter() {
      return {
        context: serverContext,
        hydrationData: {
          loaderData: serverContext.loaderData,
          actionData: null,
          errors: null,
        },
        router: { kind: "server" },
      }
    },
  }
  const documents = createOctaneDocuments({
    app,
    runtime,
    router,
    renderer: createTestRenderer(),
  })
  const template =
    '<html><head></head><body><div id="root"></div></body></html>'

  const shellDocument = await documents.renderDocument(
    template,
    new Request("https://example.test/client"),
    { mode: "shell" },
  )

  assert.equal(shellDocument.status, 200)
  assert.equal(shellDocument.routeData, undefined)

  const staticDocument = await documents.renderDocument(
    template,
    new Request("https://example.test/built"),
  )

  assert.deepEqual(staticDocument.routeData, { value: 42 })

  const fragment = await documents.renderFragment(
    new Request("https://example.test/built?__flamefront_fragment=1"),
  )

  assert.equal(fragment.protocol, "flamefront-static-fragment-v1")
  assert.equal(fragment.route, "/built")
  assert.equal(fragment.html, "<article>200</article>")
  assert.deepEqual(fragment.routeData, { value: 42 })
})

test("renders static fragment boundaries from the route hierarchy", async () => {
  const app = defineApp({
    shell,
    routes: [route("/built", "/src/Built.tsrx", { render: "static" })],
  })
  const runtime = createRouteRuntime({
    app,
    importRoute: async () => ({ default: null }),
  })
  const context = {
    loaderData: { "flamefront:route:0": { value: 42 } },
    actionData: null,
    errors: null,
    statusCode: 200,
    matches: [{ route: { id: "flamefront:route:0" } }],
  }
  const router: DocumentRouter = {
    routes: [{ id: "root" }],
    routeMetadata: [
      {
        id: "flamefront:shell:root",
        boundary: "shell-boundary",
        kind: "shell",
        entry: shell,
        navigation: "router",
      },
      {
        id: "flamefront:route:0",
        boundary: "page-boundary",
        kind: "route",
        entry: "/src/Built.tsrx",
        path: "/built",
        render: "static",
        navigation: "fragment",
        parent: "flamefront:shell:root",
      },
    ],
    async createServerRouter() {
      return {
        context,
        hydrationData: {
          loaderData: context.loaderData,
          actionData: null,
          errors: null,
        },
        router: { kind: "server" },
      }
    },
  }
  const boundaries: string[] = []
  const renderer: OctaneRenderer = {
    ...createTestRenderer(),
    renderRouteFragment: (_router, _context, boundary) => {
      boundaries.push(boundary)
      return {
        html: `<section data-boundary="${boundary}">fragment</section>`,
        css: "",
      }
    },
  }
  const documents = createOctaneDocuments({ app, runtime, router, renderer })

  const fragment = await documents.renderFragment(
    new Request("https://example.test/built?__flamefront_fragment=1"),
  )

  assert.deepEqual(boundaries, ["shell-boundary", "page-boundary"])
  assert.equal(
    fragment.html,
    '<section data-boundary="page-boundary">fragment</section>',
  )
  assert.deepEqual(
    fragment.boundaries.map(({ boundary, html }) => ({ boundary, html })),
    [
      {
        boundary: "shell-boundary",
        html: '<section data-boundary="shell-boundary">fragment</section>',
      },
      {
        boundary: "page-boundary",
        html: '<section data-boundary="page-boundary">fragment</section>',
      },
    ],
  )
})
