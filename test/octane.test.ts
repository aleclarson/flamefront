import assert from "node:assert/strict"
import { test } from "vitest"
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

  assert.equal(fragment.protocol, "flamefront-route-fragment-v1")
  assert.equal(fragment.route, "/built")
  assert.equal(fragment.html, "<article>200</article>")
  assert.deepEqual(fragment.routeData, { value: 42 })
})

test("renders server fragments with sanitized request-time URL and context", async () => {
  const app = defineApp({
    shell,
    routes: [route("/live", "/src/Live.tsrx", { render: "server" })],
  })
  let routerRequest: Request | undefined
  let routerContext: unknown
  const runtime = createRouteRuntime({
    app,
    importRoute: async () => ({ default: null }),
    requestContext: ({ request, mode, purpose }) => ({
      cookie: request.headers.get("cookie"),
      mode,
      purpose,
    }),
  })
  const context = {
    loaderData: { live: { value: "fresh" } },
    actionData: null,
    errors: null,
    statusCode: 203,
    matches: [{ route: { id: "live" } }],
  }
  const router: DocumentRouter = {
    routes: [{ id: "root" }],
    async createServerRouter(request, options) {
      routerRequest = request
      routerContext = options?.requestContext
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
  const documents = createOctaneDocuments({
    app,
    runtime,
    router,
    renderer: createTestRenderer(),
  })

  const fragment = await documents.renderFragment(
    new Request(
      "https://example.test/live?view=full&__flamefront_fragment=1&__flamefront_shell=1",
      { headers: { Cookie: "session=abc" } },
    ),
  )

  assert.equal(routerRequest?.url, "https://example.test/live?view=full")
  assert.deepEqual(routerContext, {
    cookie: "session=abc",
    mode: "server",
    purpose: "document",
  })
  assert.equal(fragment.status, 203)
  assert.deepEqual(fragment.routeData, { value: "fresh" })
})

test("renders route fragment boundaries from the route hierarchy", async () => {
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
  const fragmentOptions: unknown[] = []
  const renderer: OctaneRenderer = {
    ...createTestRenderer(),
    renderRouteFragment: (_router, _context, boundary, options) => {
      boundaries.push(boundary)
      fragmentOptions.push(options)
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
  assert.deepEqual(fragmentOptions, [
    { identifierPrefix: "flamefront-outlet-" },
    { identifierPrefix: "flamefront-outlet-" },
  ])
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

test("moves a shell-owned route error to the first outlet boundary", async () => {
  const app = defineApp({
    shell,
    routes: [route("/broken", "/src/Broken.tsrx")],
  })
  const runtime = createRouteRuntime({
    app,
    importRoute: async () => ({ default: null }),
  })
  const shellError = {
    status: 500,
    statusText: "",
    internal: false,
    data: "broken",
  }
  const context = {
    loaderData: {},
    actionData: null,
    errors: { "shell-id": shellError },
    statusCode: 500,
    matches: [{ route: { id: "outlet-id" } }],
  }
  let renderedContext: unknown
  let fragmentContext: unknown
  const router: DocumentRouter = {
    routes: [{ id: "root" }],
    routeMetadata: [
      {
        id: "shell-id",
        boundary: "shell-boundary",
        kind: "shell",
        entry: shell,
        navigation: "router",
      },
      {
        id: "outlet-id",
        boundary: "outlet-boundary",
        kind: "route",
        entry: "/src/Broken.tsrx",
        path: "/broken",
        render: "server",
        navigation: "fragment",
        parent: "shell-id",
      },
    ],
    async createServerRouter() {
      return {
        context,
        hydrationData: {
          loaderData: {},
          actionData: null,
          errors: context.errors,
        },
        router: { routes: [{ id: "root" }] },
      }
    },
  }
  const renderer: OctaneRenderer = {
    createStaticRouter: (_routes, nextContext) => ({
      routes: _routes,
      context: nextContext,
    }),
    renderToString: (_component, props) => {
      renderedContext = props.context
      return { html: "<main>broken</main>", css: "" }
    },
    renderRouteFragment: (_router, nextContext, boundary) => {
      if (boundary === "outlet-boundary") {
        fragmentContext = nextContext
      }

      return { html: "<main>broken</main>", css: "" }
    },
    defaultRouterDocument: () => null,
  }
  const documents = createOctaneDocuments({ app, runtime, router, renderer })

  const result = await documents.renderDocument(
    '<html><head></head><body><div id="root"></div></body></html>',
    new Request("https://example.test/broken"),
  )

  assert.equal(result.status, 500)
  assert.deepEqual(
    (renderedContext as { errors: Record<string, unknown> }).errors,
    { "outlet-id": shellError },
  )
  assert.deepEqual(
    (fragmentContext as { errors: Record<string, unknown> }).errors,
    { "outlet-id": shellError },
  )
})
