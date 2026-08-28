/// <reference types="vite/client" />

import {
  Hydrate,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "octane"
import {
  condition,
  idle,
  interaction,
  media,
  never,
  visible,
} from "octane/hydration"
import type { Context } from "octane"
import {
  UNSAFE_DataRouterContext,
  UNSAFE_DataRouterStateContext,
  UNSAFE_FetchersContext,
  UNSAFE_LocationContext,
  UNSAFE_NavigationContext,
  UNSAFE_RouteContext,
  UNSAFE_ViewTransitionContext,
} from "@octanejs/remix-router"
import type { GeneratedRouteMetadata, HydrationMode } from "./index.ts"

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

const serverEnvironment = typeof document === "undefined"

const rootSlot = Symbol.for("flamefront:route-fragment:root")
const hydrationSlot = Symbol.for("flamefront:route-fragment:hydrate")
const hostSlot = Symbol.for("flamefront:route-fragment:host")
const initialRouteSlot = Symbol.for("flamefront:route-fragment:initial")
const shellRootSlot = Symbol.for("flamefront:shell-outlet:root")
const shellBridgeSlot = Symbol.for("flamefront:shell-outlet:bridge")
const shellBridgeComponentSlot = Symbol.for("flamefront:shell-outlet:component")
const shellRevisionSlot = Symbol.for("flamefront:shell-outlet:revision")
const shellHostSlot = Symbol.for("flamefront:shell-outlet:host")
const shellHtmlSlot = Symbol.for("flamefront:shell-outlet:html")
const shellSetupSlot = Symbol.for("flamefront:shell-outlet:setup")
const shellUpdateSlot = Symbol.for("flamefront:shell-outlet:update")
const shellCleanupSlot = Symbol.for("flamefront:shell-outlet:cleanup")
const shellLocationSlot = Symbol.for("flamefront:shell-outlet:location")
const shellErrorSlot = Symbol.for("flamefront:shell-outlet:error")

/** Server fragment renders omit the selected boundary's outer host element. */
export const routeFragmentBoundaryTarget = createContext<string | null>(null)

/** Server-only HTML for the independently-owned routed outlet. */
export const routeOutletHtmlContext = createContext<string | null>(null)

function boundaryProps(
  metadata: Pick<GeneratedRouteMetadata, "boundary" | "kind">,
): Record<string, unknown> {
  return {
    "data-flamefront-boundary": metadata.boundary,
    "data-flamefront-boundary-kind": metadata.kind,
    style: "display:contents",
  }
}

interface NestedOutletRoot {
  unmount(): void
  readonly render?: (
    Component: RenderableComponent,
    props?: Record<string, unknown>,
  ) => void
}

interface ContextBridgeState {
  component: RenderableComponent
  contexts: ContextBridgeContexts
}

interface ClientOutletProps {
  readonly dangerouslySetInnerHTML: { readonly __html: string }
  readonly suppressHydrationWarning: true
}

const emptyOutletProps = Object.freeze({})
const routeOutletHostPropsSlot = Symbol.for("flamefront:shell-outlet:props")

interface ContextBridgeContexts {
  readonly dataRouter: ContextValue<typeof UNSAFE_DataRouterContext>
  readonly dataRouterState: ContextValue<typeof UNSAFE_DataRouterStateContext>
  readonly fetchers: ContextValue<typeof UNSAFE_FetchersContext>
  readonly location: ContextValue<typeof UNSAFE_LocationContext>
  readonly navigation: ContextValue<typeof UNSAFE_NavigationContext>
  readonly route: ContextValue<typeof UNSAFE_RouteContext>
  readonly viewTransition: ContextValue<typeof UNSAFE_ViewTransitionContext>
}

function shellOutletHost(boundary: string): HTMLDivElement | null {
  if (typeof document === "undefined") {
    return null
  }

  for (const candidate of document.querySelectorAll<HTMLElement>(
    '[data-flamefront-region="outlet"]',
  )) {
    const owner = candidate.closest("[data-flamefront-boundary]")

    if (owner?.getAttribute("data-flamefront-boundary") === boundary) {
      return candidate as HTMLDivElement
    }
  }

  return null
}

function shellOutletHtml(boundary: string): string {
  return shellOutletHost(boundary)?.innerHTML ?? ""
}

function shellHydrationBoundary(
  hydration: HydrationMode,
  children: unknown,
  deferredActivation = false,
): unknown {
  if (hydration === "full") {
    return children
  }

  if (hydration === "deferred") {
    // A deferred shell is router-aware but dormant until the first location
    // change; this is intentionally a condition trigger, not idle hydration.
    return <Hydrate when={condition(deferredActivation)}>{children}</Hydrate>
  }

  if (hydration === "none") {
    return <Hydrate when={never()}>{children}</Hydrate>
  }

  switch (hydration.when) {
    case "idle":
      return (
        <Hydrate when={idle({ timeout: hydration.timeout })}>
          {children}
        </Hydrate>
      )
    case "visible":
      return (
        <Hydrate
          when={visible({
            rootMargin: hydration.rootMargin,
            threshold:
              hydration.threshold === undefined
                ? undefined
                : [
                    ...(Array.isArray(hydration.threshold)
                      ? hydration.threshold
                      : [hydration.threshold]),
                  ],
          })}
        >
          {children}
        </Hydrate>
      )
    case "interaction":
      return (
        <Hydrate when={interaction({ events: hydration.events })}>
          {children}
        </Hydrate>
      )
    case "media":
      return <Hydrate when={media(hydration.query)}>{children}</Hydrate>
  }
}

function RouteOutletHost(props: {
  readonly initialHtml: string
  readonly serverOutlet: unknown
}): unknown {
  const serverOutletHtml = useContext(routeOutletHtmlContext)
  const attributes = {
    "data-flamefront-region": "outlet",
    "data-flamefront-outlet": "true",
    style: "display:contents",
  }

  const clientProps = useMemo<ClientOutletProps | typeof emptyOutletProps>(
    () =>
      !serverEnvironment && props.initialHtml !== ""
        ? Object.freeze({
            dangerouslySetInnerHTML: Object.freeze({
              __html: props.initialHtml,
            }),
            suppressHydrationWarning: true,
          })
        : emptyOutletProps,
    [props.initialHtml],
    routeOutletHostPropsSlot,
  )

  return (
    <div {...attributes} {...clientProps}>
      {serverEnvironment ? (
        <div data-flamefront-outlet-root="true">
          <div
            data-flamefront-outlet-content="true"
            {...(serverOutletHtml === null
              ? {}
              : { dangerouslySetInnerHTML: { __html: serverOutletHtml } })}
          >
            {serverOutletHtml === null ? props.serverOutlet : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function createShellBoundary(
  Component: RenderableComponent,
  metadata: Pick<GeneratedRouteMetadata, "boundary" | "kind" | "hydration">,
): (props: Record<string, unknown>) => unknown {
  return function ShellBoundary(props) {
    const dataRouter = useContext(UNSAFE_DataRouterContext)
    const dataRouterState = useContext(UNSAFE_DataRouterStateContext)
    const fetchers = useContext(UNSAFE_FetchersContext)
    const location = useContext(UNSAFE_LocationContext)
    const navigation = useContext(UNSAFE_NavigationContext)
    const route = useContext(UNSAFE_RouteContext)
    const viewTransition = useContext(UNSAFE_ViewTransitionContext)
    const rootRef = useRef<NestedOutletRoot | null>(null, shellRootSlot)
    const hostRef = useRef<HTMLDivElement | null>(null, shellHostSlot)
    const bridgeStateRef = useRef<ContextBridgeState | null>(
      null,
      shellBridgeSlot,
    )
    const bridgeRef = useRef<RenderableComponent | null>(
      null,
      shellBridgeComponentSlot,
    )
    const revisionRef = useRef(0, shellRevisionSlot)
    const initialHtmlRef = useRef<string | null>(null, shellHtmlSlot)
    const initialLocationRef = useRef<string | null>(null, shellLocationSlot)
    const initialErrorRef = useRef<boolean | null>(null, shellErrorSlot)

    const currentLocation = location?.location
    const locationIdentity = currentLocation
      ? `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}:${currentLocation.key}`
      : ""

    if (initialLocationRef.current === null) {
      initialLocationRef.current = locationIdentity
    }

    if (initialHtmlRef.current === null) {
      initialHtmlRef.current = shellOutletHtml(metadata.boundary)
    }

    if (initialErrorRef.current === null) {
      initialErrorRef.current = dataRouterState?.errors != null
    }

    const routerErrors = dataRouterState?.errors
    const routerErrorIdentity = routerErrors
      ? Object.keys(routerErrors).join("\u0000")
      : ""

    if (bridgeStateRef.current === null) {
      const state = {
        component: (() => null) as RenderableComponent,
        contexts: {
          dataRouter,
          dataRouterState,
          fetchers,
          location,
          navigation,
          route,
          viewTransition,
        },
      }

      state.component = () => state.contexts.route.outlet
      bridgeStateRef.current = state
    } else {
      bridgeStateRef.current.contexts = {
        dataRouter,
        dataRouterState,
        fetchers,
        location,
        navigation,
        route,
        viewTransition,
      }
    }

    bridgeRef.current ??= createContextBridge(
      bridgeStateRef as {
        current: ContextBridgeState
      },
    )
    revisionRef.current += 1
    const bridge = bridgeRef.current
    const revision = revisionRef.current

    useLayoutEffect(
      () => {
        if (import.meta.env.SSR) {
          return
        }

        const host = shellOutletHost(metadata.boundary)

        if (!host) {
          return
        }

        // The outer router can render the default error element without
        // Remix's private RouteErrorContext provider. Keep a server-rendered
        // initial error opaque until the router leaves the error location;
        // replacing it from the nested root would turn its payload into null.
        if (
          initialErrorRef.current &&
          initialHtmlRef.current !== "" &&
          rootRef.current === null &&
          routerErrorIdentity !== ""
        ) {
          return
        }

        const outletRoot =
          host.querySelector<HTMLDivElement>(
            '[data-flamefront-outlet-root="true"]',
          ) ?? host
        const outletContent =
          outletRoot.querySelector<HTMLDivElement>(
            '[data-flamefront-outlet-content="true"]',
          ) ?? outletRoot

        hostRef.current = outletContent
        let active = true

        void import("./fragment-hydration-client.tsx").then(
          ({ renderRouteOutlet }) => {
            if (!active || hostRef.current !== outletContent) {
              return
            }

            if (rootRef.current) {
              rootRef.current.render?.(bridge, {
                revision: revisionRef.current,
              })
              return
            }

            rootRef.current = renderRouteOutlet(
              outletContent,
              bridge,
              outletContent.hasChildNodes() && routerErrors == null,
            )
          },
        )

        return () => {
          active = false
        }
      },
      [bridge, routerErrorIdentity, routerErrors],
      shellSetupSlot,
    )

    useEffect(
      () => {
        rootRef.current?.render?.(bridge, {
          revision,
        })
      },
      [bridge, revision],
      shellUpdateSlot,
    )

    useLayoutEffect(
      () => () => {
        rootRef.current?.unmount()
        rootRef.current = null
        hostRef.current = null
      },
      [],
      shellCleanupSlot,
    )

    const shellRoute = {
      ...route,
      outlet: (
        <RouteOutletHost
          initialHtml={initialHtmlRef.current ?? ""}
          serverOutlet={bridge}
        />
      ),
    }
    const shell = (
      <UNSAFE_RouteContext.Provider value={shellRoute}>
        <Component {...props} />
      </UNSAFE_RouteContext.Provider>
    )
    const body = shellHydrationBoundary(
      metadata.hydration ?? "full",
      shell,
      locationIdentity !== initialLocationRef.current,
    )
    const target = useContext(routeFragmentBoundaryTarget)

    return target === metadata.boundary ? (
      body
    ) : (
      <div {...boundaryProps(metadata)}>{body}</div>
    )
  }
}

/** Add a stable DOM boundary around every generated shell/layout/route node. */
export function createRouteBoundary(
  Component: RenderableComponent,
  metadata: Pick<GeneratedRouteMetadata, "boundary" | "kind" | "hydration">,
): (props: Record<string, unknown>) => unknown {
  if (metadata.kind === "shell") {
    return createShellBoundary(Component, metadata)
  }

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

function createContextBridge(stateRef: {
  readonly current: ContextBridgeState
}): (props: Record<string, unknown>) => unknown {
  const DataRouterProvider = UNSAFE_DataRouterContext.Provider
  const DataRouterStateProvider = UNSAFE_DataRouterStateContext.Provider
  const FetchersProvider = UNSAFE_FetchersContext.Provider
  const LocationProvider = UNSAFE_LocationContext.Provider
  const NavigationProvider = UNSAFE_NavigationContext.Provider
  const RouteProvider = UNSAFE_RouteContext.Provider
  const ViewTransitionProvider = UNSAFE_ViewTransitionContext.Provider

  return () => {
    const { component, contexts } = stateRef.current
    const Component = component

    return (
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
}

function routeLocationUrl(): string {
  const location = useContext(UNSAFE_LocationContext)
  const currentLocation = location.location

  return `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`
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
  const basename = options.routing.basename ?? "/"

  return function RouteFragmentRoute(props) {
    const FallbackComponent = fallbackComponent
    const routeUrl = routeLocationUrl()
    const loadedArtifact = getRouteFragment(routeUrl, { basename })
    const hostRef = useRef<HTMLDivElement | null>(null, hostSlot)
    const initialServerUrlRef = useRef<string | null>(null, initialRouteSlot)
    const hasServerMarkup = hasServerBoundary(options.metadata.boundary)

    if (initialServerUrlRef.current === null && hasServerMarkup) {
      initialServerUrlRef.current = routeUrl
    }

    const isInitialServerRoute = initialServerUrlRef.current === routeUrl
    const artifact = isInitialServerRoute ? undefined : loadedArtifact
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
        const bridge = createContextBridge({
          current: {
            component: hydratedComponent,
            contexts: {
              dataRouter,
              dataRouterState,
              fetchers,
              location,
              navigation,
              route,
              viewTransition,
            },
          },
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

    return (
      <div
        {...boundaryProps(options.metadata)}
        ref={hostRef}
        {...(artifact
          ? { dangerouslySetInnerHTML: { __html: artifact.html } }
          : isInitialServerRoute
            ? { children: <FallbackComponent {...props} /> }
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
