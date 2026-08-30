declare module "virtual:flamefront/remix-routes" {
  import type { RouteObject } from "@octanejs/remix-router"
  import type { RouterDocument as RouterDocumentComponent } from "./octane.tsx"
  import type {
    GeneratedRouteMetadata,
    NormalizedRoutingOptions,
  } from "./index.ts"

  export const RouterDocument: RouterDocumentComponent
  export const routes: RouteObject[]
  export const routing: NormalizedRoutingOptions
  export const routeMetadata: readonly GeneratedRouteMetadata[]
  export function preloadRoute(entry: string): Promise<void>
}

declare module "virtual:flamefront/server-routes" {
  import type { RouteModule } from "./server.ts"

  export function importRoute(entry: string): Promise<RouteModule>
}

declare module "virtual:flamefront/server-entry" {
  import type { RouteDefinition } from "./index.ts"
  import type {
    FetchServerEntryOptions,
    FlamefrontFetchServerEntry,
  } from "./fetch.ts"
  import type { FlamefrontServerEntry, SrvxServerEntryOptions } from "./srvx.ts"

  export function createServerEntry<
    Route extends RouteDefinition = RouteDefinition,
  >(
    options: FetchServerEntryOptions<Route> | SrvxServerEntryOptions<Route>,
  ): FlamefrontFetchServerEntry | FlamefrontServerEntry
}
