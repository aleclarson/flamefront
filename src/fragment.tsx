/// <reference types="vite/client" />

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

import {
  getRouteFragment,
  shouldHydrateRouteFragment,
  type RouteFragmentCachePolicy,
  type RouteFragmentRoutingOptions,
} from "./fragment-client.ts"

export {
  assertRouteFragmentArtifact,
  getRouteFragment,
  isRouteFragmentArtifact,
  loadRouteFragment,
  prefetchRouteFragment,
  shouldHydrateRouteFragment,
  routeFragmentProtocol,
} from "./fragment-client.ts"
export type {
  RouteFragmentArtifact,
  RouteFragmentBoundary,
  RouteFragmentCachePolicy,
  RouteFragmentLoadOptions,
  RouteFragmentRoutingOptions,
} from "./fragment-client.ts"

export interface RouteFragmentRouteOptions {
  readonly metadata: Pick<
    GeneratedRouteMetadata,
    "id" | "boundary" | "kind" | "parent" | "path" | "hydration"
  >
  readonly routing: RouteFragmentRoutingOptions
  readonly policy: RouteFragmentCachePolicy
  /** Used only for initial document hydration and post-insertion hydration. */
  readonly fallbackComponent: RenderableComponent
}

type RenderableComponent<Props = Record<string, unknown>> = (
  props: Props,
) => unknown

type ContextValue<Value> = Value extends Context<infer Result> ? Result : never

const rootSlot = Symbol.for("flamefront:route-fragment:root")
const hydrationSlot = Symbol.for("flamefront:route-fragment:hydrate")
const hostSlot = Symbol.for("flamefront:route-fragment:host")

/** Server fragment renders omit the selected boundary's outer host element. */
export const routeFragmentBoundaryTarget = createContext<string | null>(null)

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
    const target = useContext(routeFragmentBoundaryTarget)
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
export function createRouteFragmentRoute(
  options: RouteFragmentRouteOptions,
): (props: Record<string, unknown>) => unknown {
  const fallbackComponent = options.fallbackComponent
  const fallbackBoundary = createRouteBoundary(
    fallbackComponent,
    options.metadata,
  )
  const basename = options.routing.basename ?? "/"

  return function RouteFragmentRoute(props) {
    const routeUrl = routeLocationUrl()
    const artifact = getRouteFragment(routeUrl, { basename })
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
          !shouldHydrateRouteFragment(options.metadata.hydration)
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

        if (!import.meta.env.SSR) {
          void import("./fragment-hydration-client.tsx").then(
            ({ hydrateRouteFragment }) => {
              if (!active || hostRef.current !== host) {
                return
              }

              nestedRootRef.current = hydrateRouteFragment(host, bridge)
            },
          )
        }

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

export {
  isRouteFragmentRequest,
  stripFlamefrontProtocolParams,
  stripFlamefrontProtocolRequest,
  withRouteFragmentProtocol,
} from "./fragment-protocol.ts"
