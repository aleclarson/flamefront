import {
  createRemixRouterAdapter,
  type ServerRouterOptions,
  type ServerRouterResult,
} from "./remix-router-core.ts"
import {
  createBrowserRouter,
  createStaticHandler,
  createStaticRouter,
} from "@octanejs/remix-router"
import type { HydrationState } from "@octanejs/remix-router"
import type {
  AppDefinition,
  LoadRouteOptions,
  RouteDefinition,
} from "./index.ts"
import {
  createRoutePrefetchCallback,
  prefetchRouteResources,
  type RoutePrefetchCallback,
  type RoutePrefetchResources,
} from "./route-prefetch.ts"
import { prefetchStaticFragment } from "./fragment-client.ts"
import {
  preloadRoute as preloadGeneratedRoute,
  routeMetadata,
  routes,
  routing,
} from "virtual:flamefront/remix-routes"

export { routeMetadata, routes, routing }
export { createRemixRouterAdapter }
export type { ServerRouterOptions, ServerRouterResult }
export type {
  RoutePrefetchCallback,
  RoutePrefetchResources,
} from "./route-prefetch.ts"

export const staticRouterHydrationScriptId =
  "flamefront-static-router-hydration"

/** Read and remove the hydration payload emitted by the server document adapter. */
export function consumeStaticRouterHydrationData(): HydrationState | undefined {
  const data = (
    window as typeof window & {
      __staticRouterHydrationData?: unknown
    }
  ).__staticRouterHydrationData

  document.getElementById(staticRouterHydrationScriptId)?.remove()
  return data as HydrationState | undefined
}

const adapter = createRemixRouterAdapter(
  routes,
  {
    createBrowserRouter,
    createStaticHandler,
    createStaticRouter,
  },
  routing,
)

export const createClientRouter = adapter.createClientRouter
export const createServerRouter = adapter.createServerRouter

function withDefaultPrefetchResources<
  Route extends RouteDefinition = RouteDefinition,
>(
  resources: RoutePrefetchResources<Route> = {},
): RoutePrefetchResources<Route> {
  return {
    ...resources,
    staticFragment:
      resources.staticFragment ??
      ((url, _route, options) => prefetchStaticFragment(url, routing, options)),
  }
}

/** Prefetch route resources selected by the matched Flamefront route. */
export async function prefetchRoute<
  Route extends RouteDefinition = RouteDefinition,
>(
  app: Pick<AppDefinition<Route>, "match" | "prefetch">,
  url: string | URL,
  options?: LoadRouteOptions,
  resources?: RoutePrefetchResources<Route>,
): Promise<void> {
  await prefetchRouteResources(
    app,
    preloadGeneratedRoute,
    url,
    options,
    withDefaultPrefetchResources(resources),
  )
}

/** Create the callback used by `createClientRouter({ prefetch })`. */
export function createRoutePrefetcher<
  Route extends RouteDefinition = RouteDefinition,
>(
  app: Pick<AppDefinition<Route>, "match" | "prefetch">,
  resources?: RoutePrefetchResources<Route>,
): RoutePrefetchCallback {
  return createRoutePrefetchCallback(
    app,
    preloadGeneratedRoute,
    withDefaultPrefetchResources(resources),
  )
}
