import { createContext, useContext, useLayoutEffect, useRef } from "octane"
import type { Context } from "octane"
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
  readonly fallbackComponent: RenderableComponent
}

type RenderableComponent<Props = Record<string, unknown>> = (
  props: Props,
) => unknown

type ContextValue<Value> = Value extends Context<infer Result> ? Result : never

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
  Component: RenderableComponent,
  metadata: Pick<GeneratedRouteMetadata, "boundary" | "kind">,
): (props: Record<string, unknown>) => unknown {
  return (props) => {
    const target = useContext(staticFragmentBoundaryTarget)
    const children = <Component {...props} />

    return target === metadata.boundary ? (
      children
    ) : (
      <div {...boundaryProps(metadata)}>{children}</div>
    )
  }
}

function createContextBridge(
  Component: RenderableComponent,
  contexts: {
    readonly dataRouter: ContextValue<typeof UNSAFE_DataRouterContext>
    readonly dataRouterState: ContextValue<typeof UNSAFE_DataRouterStateContext>
    readonly fetchers: ContextValue<typeof UNSAFE_FetchersContext>
    readonly location: ContextValue<typeof UNSAFE_LocationContext>
    readonly navigation: ContextValue<typeof UNSAFE_NavigationContext>
    readonly route: ContextValue<typeof UNSAFE_RouteContext>
    readonly viewTransition: ContextValue<typeof UNSAFE_ViewTransitionContext>
  },
): (props: Record<string, unknown>) => unknown {
  const DataRouterProvider = UNSAFE_DataRouterContext.Provider
  const DataRouterStateProvider = UNSAFE_DataRouterStateContext.Provider
  const FetchersProvider = UNSAFE_FetchersContext.Provider
  const LocationProvider = UNSAFE_LocationContext.Provider
  const NavigationProvider = UNSAFE_NavigationContext.Provider
  const RouteProvider = UNSAFE_RouteContext.Provider
  const ViewTransitionProvider = UNSAFE_ViewTransitionContext.Provider

  return () => (
    <DataRouterProvider value={contexts.dataRouter}>
      <DataRouterStateProvider value={contexts.dataRouterState}>
        <FetchersProvider value={contexts.fetchers}>
          <LocationProvider value={contexts.location}>
            <NavigationProvider value={contexts.navigation}>
              <RouteProvider value={contexts.route}>
                <ViewTransitionProvider value={contexts.viewTransition}>
                  <Component />
                </ViewTransitionProvider>
              </RouteProvider>
            </NavigationProvider>
          </LocationProvider>
        </FetchersProvider>
      </DataRouterStateProvider>
    </DataRouterProvider>
  )
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
    const hostRef = useRef<HTMLDivElement | null>(null, hostSlot)
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
        void import("octane").then(
          ({ hydrateRoot, setDangerouslySetInnerHTML, setHTML }) => {
            if (!active || hostRef.current !== host) {
              return
            }

            // The outer document root used dangerouslySetInnerHTML to adopt the
            // static fragment. Release that ownership before the nested root
            // starts reconciling the same children.
            const html = host.innerHTML

            setDangerouslySetInnerHTML(host, null)
            setHTML(host, html)
            const Bridge = bridge
            nestedRootRef.current = hydrateRoot(host, <Bridge />)
          },
        )

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

    return (
      <div
        {...boundaryProps(options.metadata)}
        {...(artifact
          ? {
              ref: hostRef,
              dangerouslySetInnerHTML: { __html: artifact.html },
            }
          : {})}
      />
    )
  }
}

export { isStaticFragmentRequest }
