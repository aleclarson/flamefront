declare module "*.tsrx" {
  const Component: unknown

  export default Component
}

declare module "virtual:flamefront/remix-routes" {
  import type { RouteObject } from "@octanejs/remix-router"
  import type { RouterDocument as RouterDocumentComponent } from "flamefront/octane"
  import type {
    GeneratedRouteMetadata,
    NormalizedRoutingOptions,
  } from "flamefront"

  export const RouterDocument: RouterDocumentComponent
  export const routes: RouteObject[]
  export const routing: NormalizedRoutingOptions
  export const routeMetadata: readonly GeneratedRouteMetadata[]
  export function preloadRoute(entry: string): Promise<void>
}

declare module "virtual:flamefront/server-routes" {
  import type { RouteModule } from "flamefront/server"

  export function importRoute(entry: string): Promise<RouteModule>
}
