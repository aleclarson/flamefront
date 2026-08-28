import assert from "node:assert/strict"
import { test } from "vitest"
import { defineApp, route } from "../src/index.ts"
import { startOctaneClientWithRuntime } from "../src/octane-client-core.ts"
import {
  createOctaneDocuments,
  type DocumentRouter,
  type OctaneRenderer,
  type RouterDocument,
} from "../src/octane.tsx"
import { createRouteRuntime } from "../src/server.ts"

const shell = "/src/AppShell.tsrx"

test("uses one generated router document for server rendering and client hydration", async () => {
  const app = defineApp({
    shell,
    routes: [route("/deferred", "/src/Deferred.tsrx", { render: "server" })],
  })
  const sharedRouterDocument: RouterDocument = () => null
  const runtime = createRouteRuntime({
    app,
    importRoute: async () => ({ default: null }),
  })
  const staticContext = {
    loaderData: {},
    actionData: null,
    errors: null,
    statusCode: 200,
    matches: [{ route: { id: "deferred" } }],
  }
  const documentRouter: DocumentRouter = {
    routes: [{ id: "root" }],
    async createServerRouter() {
      return {
        context: staticContext,
        hydrationData: {
          loaderData: {},
          actionData: null,
          errors: null,
        },
        router: { kind: "server" },
      }
    },
  }
  let serverRouterDocument: unknown
  const renderer: OctaneRenderer = {
    createStaticRouter: () => ({ kind: "shell" }),
    renderToString(component) {
      serverRouterDocument = component
      return { html: "<main>deferred</main>", css: "" }
    },
    defaultRouterDocument: sharedRouterDocument,
  }
  const documents = createOctaneDocuments({
    app,
    runtime,
    router: documentRouter,
    renderer,
  })

  await documents.renderDocument(
    '<html><head></head><body><div id="root"></div></body></html>',
    new Request("https://example.test/deferred"),
  )

  const state = { initialized: false }
  let subscriber:
    ((nextState: { readonly initialized: boolean }) => void) | undefined
  let unsubscribeCalls = 0
  const clientRouter = {
    state,
    subscribe(nextSubscriber: typeof subscriber) {
      subscriber = nextSubscriber
      return () => {
        unsubscribeCalls += 1
      }
    },
  }
  const container = { id: "root" }
  const hydratedRoot = { kind: "hydrated" }
  let clientRouterDocument: unknown
  let clientRouterProps: unknown
  let clientRootOptions: unknown
  const started = startOctaneClientWithRuntime(
    { app },
    {
      pathname: "/deferred",
      defaultRoot: container,
      routerDocument: sharedRouterDocument,
      consumeHydrationData: () => ({ loaderData: {} }),
      createRoutePrefetcher: () => "prefetch",
      createClientRouter: () => clientRouter,
      renderRoot() {
        throw new Error("A server route must hydrate its document.")
      },
      hydrateRoot(_root, component, props, options) {
        clientRouterDocument = component
        clientRouterProps = props
        clientRootOptions = options
        return hydratedRoot
      },
    },
  )

  await Promise.resolve()
  assert.equal(clientRouterDocument, undefined)

  state.initialized = true
  subscriber?.(state)
  const client = await started

  assert.equal(serverRouterDocument, sharedRouterDocument)
  assert.equal(clientRouterDocument, sharedRouterDocument)
  assert.deepEqual(clientRouterProps, {
    router: clientRouter,
    context: undefined,
  })
  assert.deepEqual(clientRootOptions, {
    identifierPrefix: "flamefront-shell-",
  })
  assert.equal(unsubscribeCalls, 1)
  assert.equal(client.root, hydratedRoot)
})

test("uses the shell identifier namespace for client-only mounting", async () => {
  const app = defineApp({
    shell,
    routes: [route("/client", "/src/Client.tsrx", { render: "client" })],
  })
  const state = { initialized: true }
  const clientRouter = {
    state,
    subscribe() {
      return () => {}
    },
  }
  let clientRootOptions: unknown

  await startOctaneClientWithRuntime(
    { app },
    {
      pathname: "/client",
      defaultRoot: { id: "root" },
      routerDocument: () => null,
      consumeHydrationData: () => ({}),
      createRoutePrefetcher: () => "prefetch",
      createClientRouter: () => clientRouter,
      renderRoot(_root, _component, _props, options) {
        clientRootOptions = options
        return { kind: "mounted" }
      },
      hydrateRoot() {
        throw new Error("A client route must mount its document.")
      },
    },
  )

  assert.deepEqual(clientRootOptions, {
    identifierPrefix: "flamefront-shell-",
  })
})
