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
  import type { RouteDefinition, RoutePath } from "flamefront"
  import type { RouteModule, RouteModuleForRoute } from "flamefront/server"

  type AnyRouteModule<Context> = RouteModuleForRoute<
    RoutePath extends infer Path
      ? Path extends string
        ? RouteDefinition<Path, string>
        : never
      : never,
    Context
  >

  export function importRoute<Context = unknown>(
    entry: string,
  ): Promise<AnyRouteModule<Context>>
  // Fallback for apps whose route union is not literal (e.g. glob routes).
  export function importRoute<Context = unknown>(
    entry: string,
  ): Promise<RouteModule<unknown, Context>>
  export function loadActions(): Promise<void>
}
