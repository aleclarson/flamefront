declare module "virtual:flamefront/remix-routes" {
  import type { RouteObject } from "@octanejs/remix-router"
  import type { RouterDocument as RouterDocumentComponent } from "./octane.ts"
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
