import assert from "node:assert/strict"
import test from "node:test"
import { defineApp, route } from "../src/index.ts"
import { startOctaneClientWithRuntime } from "../src/octane-client-core.ts"
import {
  createOctaneDocuments,
  type DocumentRouter,
  type OctaneRenderer,
  type RouterDocument,
} from "../src/octane.ts"
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
      hydrateRoot(_root, component, props) {
        clientRouterDocument = component
        clientRouterProps = props
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
  assert.equal(unsubscribeCalls, 1)
  assert.equal(client.root, hydratedRoot)
})
