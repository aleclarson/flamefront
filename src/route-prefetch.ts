import type {
  LoadRouteOptions,
  MatchRouteOptions,
  RouteDefinition,
  RouteMatchForUrl,
} from "./index.ts"

/**
 * Resources that a route-aware prefetcher can warm without taking over
 * navigation. The framework adapter supplies the static fragment transport;
 * callers can replace it when they own the transport.
 */
export interface RoutePrefetchResources<
  Route extends RouteDefinition = RouteDefinition,
> {
  readonly staticFragment?: (
    url: string | URL,
    route: Route,
    options?: LoadRouteOptions,
  ) => void | Promise<void>
}

export type RouteModulePreloader = (entry: string) => void | Promise<void>

export type RoutePrefetchCallback = (to: string) => void | Promise<void>

type RoutePrefetchApp<Route extends RouteDefinition> = {
  readonly match: (
    url: string | URL,
    options?: MatchRouteOptions,
  ) => RouteMatchForUrl<Route, string> | null
  readonly prefetch: (
    url: string | URL,
    options?: LoadRouteOptions,
  ) => Promise<void>
}

/**
 * Warm the resources used by a matched route. Live routes share route data
 * and client-module caches. Static routes hand off to the fragment resource
 * seam and never import their route module as a rendering path.
 */
export async function prefetchRouteResources<
  Route extends RouteDefinition = RouteDefinition,
>(
  app: RoutePrefetchApp<Route>,
  preloadRoute: RouteModulePreloader,
  url: string | URL,
  options: LoadRouteOptions = {},
  resources: RoutePrefetchResources<Route> = {},
): Promise<void> {
  const match = app.match(url)

  if (!match) {
    return
  }

  if (match.data.render === "static") {
    await resources.staticFragment?.(url, match.data, options)
    return
  }

  await Promise.all([
    app.prefetch(url, options),
    preloadRoute(match.data.entry),
  ])
}

/** Create the callback accepted by the generic browser router. */
export function createRoutePrefetchCallback<
  Route extends RouteDefinition = RouteDefinition,
>(
  app: RoutePrefetchApp<Route>,
  preloadRoute: RouteModulePreloader,
  resources: RoutePrefetchResources<Route> = {},
): RoutePrefetchCallback {
  return (to) =>
    prefetchRouteResources(app, preloadRoute, to, undefined, resources)
}
