import type { AppDefinition, RouteDefinition } from "./index.ts"
import type { RouterDocument, RouterDocumentProps } from "./octane.tsx"
import { shellIdentifierPrefix } from "./identifier-prefix.ts"

export type OctaneClientApp<Route extends RouteDefinition = RouteDefinition> =
  Pick<AppDefinition<Route>, "match" | "prefetch" | "document">

export interface OctaneClientRouter {
  readonly state: { readonly initialized: boolean }
  subscribe(
    subscriber: (state: { readonly initialized: boolean }) => void,
  ): () => void
}

export interface StartOctaneClientOptions<
  Route extends RouteDefinition = RouteDefinition,
  Container = Element | Document,
> {
  readonly app: OctaneClientApp<Route>
  /** Defaults to `document` for app documents, otherwise the `#root` element. */
  readonly root?: Container | null
  /** Use the same override in `createOctaneDocuments` on the server. */
  readonly routerDocument?: RouterDocument
}

export interface StartedOctaneClient<Router, Root> {
  readonly router: Router
  readonly root: Root
}

export interface OctaneClientRuntime<
  Route extends RouteDefinition,
  Router extends OctaneClientRouter,
  Root,
  Container,
  HydrationData,
  Prefetch,
> {
  readonly pathname: string
  readonly defaultRoot: Container | null
  readonly routerDocument: RouterDocument
  readonly documentAssets?: RouterDocumentProps["documentAssets"]
  consumeHydrationData(): HydrationData
  createRoutePrefetcher(app: OctaneClientApp<Route>): Prefetch
  createClientRouter(options: {
    readonly hydrationData: HydrationData
    readonly prefetch: Prefetch
  }): Router
  renderRoot(
    container: Container,
    component: RouterDocument,
    props: RouterDocumentProps,
    options?: { readonly identifierPrefix?: string },
  ): Root
  hydrateRoot(
    container: Container,
    component: RouterDocument,
    props: RouterDocumentProps,
    options?: { readonly identifierPrefix?: string },
  ): Root
}

async function waitForRouterInitialization(
  router: OctaneClientRouter,
): Promise<void> {
  if (router.state.initialized) {
    return
  }

  await new Promise<void>((resolve) => {
    let unsubscribe: (() => void) | undefined
    const finish = () => {
      unsubscribe?.()
      resolve()
    }

    unsubscribe = router.subscribe((state) => {
      if (state.initialized) {
        finish()
      }
    })

    if (router.state.initialized) {
      finish()
    }
  })
}

/** Internal dependency seam used by the browser adapter and focused tests. */
export async function startOctaneClientWithRuntime<
  Route extends RouteDefinition,
  Router extends OctaneClientRouter,
  Root,
  Container,
  HydrationData,
  Prefetch,
>(
  options: StartOctaneClientOptions<Route, Container>,
  runtime: OctaneClientRuntime<
    Route,
    Router,
    Root,
    Container,
    HydrationData,
    Prefetch
  >,
): Promise<StartedOctaneClient<Router, Root>> {
  const root = options.root ?? runtime.defaultRoot

  if (!root) {
    throw new Error("Octane route shell is missing #root.")
  }

  const routeMatch = options.app.match(runtime.pathname)

  if (!routeMatch) {
    throw new Error(`No Flamefront route matches ${runtime.pathname}.`)
  }

  const hydrationData = runtime.consumeHydrationData()
  const router = runtime.createClientRouter({
    hydrationData,
    prefetch: runtime.createRoutePrefetcher(options.app),
  })
  const shouldHydrate =
    Boolean(options.app.document) || routeMatch.data.render !== "client"

  if (shouldHydrate) {
    await waitForRouterInitialization(router)
  }

  const routerDocument = options.routerDocument ?? runtime.routerDocument
  const props: RouterDocumentProps = {
    router,
    context: undefined,
    ...(runtime.documentAssets
      ? { documentAssets: runtime.documentAssets }
      : {}),
  }
  const clientRoot = shouldHydrate
    ? runtime.hydrateRoot(root, routerDocument, props, {
        identifierPrefix: shellIdentifierPrefix,
      })
    : runtime.renderRoot(root, routerDocument, props, {
        identifierPrefix: shellIdentifierPrefix,
      })

  return { router, root: clientRoot }
}
