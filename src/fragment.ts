import {
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
  useRef,
} from "octane"
import {
  UNSAFE_DataRouterContext,
  UNSAFE_DataRouterStateContext,
  UNSAFE_FetchersContext,
  UNSAFE_LocationContext,
  UNSAFE_NavigationContext,
  UNSAFE_RouteContext,
  UNSAFE_ViewTransitionContext,
  useLocation as useRouterLocation,
} from "@octanejs/remix-router"
import type { GeneratedRouteMetadata } from "./index.ts"
import { isStaticFragmentRequest } from "./fragment-protocol.ts"

import {
  getStaticFragment,
  shouldHydrateStaticFragment,
  type StaticFragmentArtifact,
  type StaticFragmentRoutingOptions,
} from "./fragment-client.ts"

export {
  assertStaticFragmentArtifact,
  getStaticFragment,
  isStaticFragmentArtifact,
  loadStaticFragment,
  prefetchStaticFragment,
  shouldHydrateStaticFragment,
  staticFragmentProtocol,
} from "./fragment-client.ts"
export type {
  StaticFragmentArtifact,
  StaticFragmentBoundary,
  StaticFragmentLoadOptions,
  StaticFragmentRoutingOptions,
} from "./fragment-client.ts"

export interface StaticFragmentRouteOptions {
  readonly metadata: Pick<
    GeneratedRouteMetadata,
    "id" | "boundary" | "kind" | "parent" | "path" | "hydration"
  >
  readonly routing: StaticFragmentRoutingOptions
  /** Used only for initial document hydration and post-insertion hydration. */
  readonly fallbackComponent: unknown
}

const rootSlot = Symbol.for("flamefront:static-fragment:root")
const hydrationSlot = Symbol.for("flamefront:static-fragment:hydrate")
const hostSlot = Symbol.for("flamefront:static-fragment:host")

/** Server fragment renders omit the selected boundary's outer host element. */
export const staticFragmentBoundaryTarget = createContext<string | null>(null)

function boundaryProps(
  metadata: Pick<GeneratedRouteMetadata, "boundary" | "kind">,
): Record<string, unknown> {
  return {
    "data-flamefront-boundary": metadata.boundary,
    "data-flamefront-boundary-kind": metadata.kind,
    style: "display:contents",
  }
}

/** Add a stable DOM boundary around every generated shell/layout/route node. */
export function createRouteBoundary(
  Component: unknown,
  metadata: Pick<GeneratedRouteMetadata, "boundary" | "kind">,
): (props: Record<string, unknown>) => unknown {
  return (props) => {
    const target = useContext(staticFragmentBoundaryTarget)
    const children = createElement(Component as never, props)

    return target === metadata.boundary
      ? children
      : createElement("div", boundaryProps(metadata), children)
  }
}

function createContextBridge(
  Component: unknown,
  contexts: {
    readonly dataRouter: unknown
    readonly dataRouterState: unknown
    readonly fetchers: unknown
    readonly location: unknown
    readonly navigation: unknown
    readonly route: unknown
    readonly viewTransition: unknown
  },
): (props: Record<string, unknown>) => unknown {
  return () =>
    createElement(UNSAFE_DataRouterContext.Provider as never, {
      value: contexts.dataRouter,
      children: createElement(UNSAFE_DataRouterStateContext.Provider as never, {
        value: contexts.dataRouterState,
        children: createElement(UNSAFE_FetchersContext.Provider as never, {
          value: contexts.fetchers,
          children: createElement(UNSAFE_LocationContext.Provider as never, {
            value: contexts.location,
            children: createElement(
              UNSAFE_NavigationContext.Provider as never,
              {
                value: contexts.navigation,
                children: createElement(UNSAFE_RouteContext.Provider as never, {
                  value: contexts.route,
                  children: createElement(
                    UNSAFE_ViewTransitionContext.Provider as never,
                    {
                      value: contexts.viewTransition,
                      children: createElement(Component as never, {}),
                    },
                  ),
                }),
              },
            ),
          }),
        }),
      }),
    })
}

function routeLocationUrl(): string {
  const location = useRouterLocation()

  return `${location.pathname}${location.search}${location.hash}`
}

function unmountNestedRoot(root: { unmount(): void } | null): void {
  root?.unmount()
}

function hasServerBoundary(boundary: string): boolean {
  if (typeof document === "undefined") {
    return false
  }

  return Boolean(
    document.querySelector(`[data-flamefront-boundary="${boundary}"]`),
  )
}

/**
 * Route component used by generated browser routes. Navigation renders the
 * fetched artifact into a boundary first; only the later layout effect may
 * hydrate that boundary. The fallback component is used for direct-document
 * hydration when no fragment was fetched by the browser router.
 */
export function createStaticFragmentRoute(
  options: StaticFragmentRouteOptions,
): (props: Record<string, unknown>) => unknown {
  const fallbackComponent = options.fallbackComponent
  const fallbackBoundary = createRouteBoundary(
    fallbackComponent,
    options.metadata,
  )
  const basename = options.routing.basename ?? "/"

  return function StaticFragmentRoute(props) {
    const routeUrl = routeLocationUrl()
    const artifact = getStaticFragment(routeUrl, { basename })
    const hostRef = useRef<Element | null>(null, hostSlot)
    const nestedRootRef = useRef<{ unmount(): void } | null>(null, rootSlot)
    const dataRouter = useContext(UNSAFE_DataRouterContext)
    const dataRouterState = useContext(UNSAFE_DataRouterStateContext)
    const fetchers = useContext(UNSAFE_FetchersContext)
    const location = useContext(UNSAFE_LocationContext)
    const navigation = useContext(UNSAFE_NavigationContext)
    const route = useContext(UNSAFE_RouteContext)
    const viewTransition = useContext(UNSAFE_ViewTransitionContext)

    useLayoutEffect(
      () => {
        if (
          !artifact ||
          !shouldHydrateStaticFragment(options.metadata.hydration)
        ) {
          return
        }

        const host = hostRef.current
        if (!host) {
          return
        }

        let active = true
        const hydratedComponent = fallbackComponent
        const bridge = createContextBridge(hydratedComponent, {
          dataRouter,
          dataRouterState,
          fetchers,
          location,
          navigation,
          route,
          viewTransition,
        })

        unmountNestedRoot(nestedRootRef.current)
        nestedRootRef.current = null
        void import("octane").then(({ hydrateRoot }) => {
          if (!active || hostRef.current !== host) {
            return
          }

          nestedRootRef.current = hydrateRoot(host, createElement(bridge, {}))
        })

        return () => {
          active = false
          unmountNestedRoot(nestedRootRef.current)
          nestedRootRef.current = null
        }
      },
      [
        artifact,
        dataRouter,
        dataRouterState,
        fetchers,
        location,
        navigation,
        route,
        viewTransition,
        options.metadata.hydration,
      ],
      hydrationSlot,
    )

    if (!artifact && hasServerBoundary(options.metadata.boundary)) {
      return fallbackBoundary(props)
    }

    return createElement("div", {
      ...boundaryProps(options.metadata),
      ...(artifact
        ? {
            ref: hostRef,
            dangerouslySetInnerHTML: { __html: artifact.html },
          }
        : {}),
    })
  }
}

export { isStaticFragmentRequest }
