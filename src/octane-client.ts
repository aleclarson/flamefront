import type { DataRouter } from "@octanejs/remix-router"
import { createRoot, hydrateRoot, type Root } from "octane"
import type { RouteDefinition } from "./index.ts"
import {
  startOctaneClientWithRuntime,
  type StartOctaneClientOptions,
  type StartedOctaneClient,
} from "./octane-client-core.ts"
import {
  consumeStaticRouterHydrationData,
  createClientRouter,
  createRoutePrefetcher,
  RouterDocument,
} from "./remix-router.ts"

export { RouterDocument }
export type { StartOctaneClientOptions, StartedOctaneClient }

/**
 * Start Flamefront's generated Octane router, mounting client routes and
 * hydrating server or static routes with the same router root used for SSR.
 */
export function startOctaneClient<Route extends RouteDefinition>(
  options: StartOctaneClientOptions<Route>,
): Promise<StartedOctaneClient<DataRouter, Root>> {
  return startOctaneClientWithRuntime(options, {
    pathname: window.location.pathname,
    defaultRoot: document.getElementById("root"),
    routerDocument: RouterDocument,
    consumeHydrationData: consumeStaticRouterHydrationData,
    createRoutePrefetcher,
    createClientRouter,
    renderRoot(root, component, props) {
      const clientRoot = createRoot(root)

      clientRoot.render(component as never, props)
      return clientRoot
    },
    hydrateRoot: (root, component, props) =>
      hydrateRoot(root, component as never, props),
  })
}
