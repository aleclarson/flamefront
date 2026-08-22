import {
  createMultiMatcher,
  type Match,
  type MultiMatcher,
} from "@remix-run/route-pattern/match"
import type { HydrationInteractionEvents } from "octane/hydration"
import { createRouteDataClient } from "./route-data-client.ts"

export type RenderMode = "client" | "server" | "static"

export interface RoutingOptions {
  /** URL pathname prefix shared by app matching and generated routes. */
  readonly basename?: string
  /** Route-data endpoint pathname shared by browser loaders and the server. */
  readonly dataPath?: string
}

export interface NormalizedRoutingOptions {
  readonly basename: string
  readonly dataPath: string
}

export interface IdleHydration {
  readonly when: "idle"
  readonly timeout?: number
}

export interface VisibleHydration {
  readonly when: "visible"
  readonly rootMargin?: string
  readonly threshold?: number | readonly number[]
}

export interface InteractionHydration {
  readonly when: "interaction"
  readonly events?: HydrationInteractionEvents
}

export interface MediaHydration {
  readonly when: "media"
  readonly query: string
}

export type GeneratedHydration =
  IdleHydration | VisibleHydration | InteractionHydration | MediaHydration

/**
 * `full` hydrates with the shell, `deferred` leaves boundaries to the route,
 * `none` keeps server HTML inert, and an object generates one route boundary.
 */
export type HydrationMode = "full" | "deferred" | "none" | GeneratedHydration

export interface RouteOptions {
  readonly render?: RenderMode
  readonly hydration?: HydrationMode
}

export interface RouteDefinition extends RouteOptions {
  readonly path: string
  /** Octane/Vite project-root module ID, such as `/src/Home.tsrx`. */
  readonly entry: string
  readonly render: RenderMode
}

export interface LayoutDefinition<
  Children extends readonly RouteConfig[] = readonly RouteConfig[],
> {
  readonly kind: "layout"
  /** Octane/Vite project-root module ID for the pathless layout component. */
  readonly entry: string
  readonly children: Children
}

export type RouteConfig = RouteDefinition | LayoutDefinition

export interface MatchRouteOptions {
  readonly render?: RenderMode
}

export interface LoadRouteOptions {
  readonly signal?: AbortSignal
  readonly reload?: boolean
}

export interface AppDefinition<T extends RouteDefinition = RouteDefinition> {
  /** Octane/Vite project-root module ID for the persistent app shell. */
  readonly shell: string
  readonly routes: readonly T[]
  readonly routeTree: readonly RouteConfig[]
  readonly routing: NormalizedRoutingOptions
  readonly match: (
    url: string | URL,
    options?: MatchRouteOptions,
  ) => Match<string, T> | null
  /** Load route data using the route's live or static data source. */
  readonly load: <Data = unknown>(
    url: string | URL,
    options?: LoadRouteOptions,
  ) => Promise<Data>
  /** Warm the same cache used by generated client route loaders. */
  readonly prefetch: (
    url: string | URL,
    options?: LoadRouteOptions,
  ) => Promise<void>
}

const defaultRoutingOptions: NormalizedRoutingOptions = Object.freeze({
  basename: "/",
  dataPath: "/__flamefront/data",
})

const renderModes: ReadonlySet<unknown> = new Set<RenderMode>([
  "client",
  "server",
  "static",
])
const hydrationModes: ReadonlySet<unknown> = new Set([
  "full",
  "deferred",
  "none",
])
const interactionEvents: ReadonlySet<string> = new Set([
  "auxclick",
  "beforeinput",
  "click",
  "compositionend",
  "compositionstart",
  "compositionupdate",
  "contextmenu",
  "dblclick",
  "focusin",
  "input",
  "keydown",
  "keyup",
  "mousedown",
  "mouseenter",
  "mouseover",
  "mouseup",
  "pointerdown",
  "pointerenter",
  "pointerover",
  "pointerup",
  "touchend",
  "touchstart",
])
const matcherCache = new WeakMap<
  readonly RouteDefinition[],
  Map<RenderMode | undefined, MultiMatcher<RouteDefinition>>
>()

function normalizeRoutingPath(
  value: unknown,
  name: string,
  fallback: string,
): string {
  const path = value ?? fallback

  if (typeof path !== "string" || path.length === 0) {
    throw new TypeError(
      `flamefront routing ${name} must be a non-empty string.`,
    )
  }

  if (!path.startsWith("/")) {
    throw new TypeError(`flamefront routing ${name} must start with '/'.`)
  }

  if (path.includes("?") || path.includes("#")) {
    throw new TypeError(
      `flamefront routing ${name} must be a pathname without a query or hash.`,
    )
  }

  return path.replace(/\/+$/, "") || "/"
}

export function normalizeRoutingOptions(
  options: RoutingOptions | undefined = undefined,
): NormalizedRoutingOptions {
  if (options !== undefined && (!options || typeof options !== "object")) {
    throw new TypeError("flamefront routing options must be an object.")
  }

  return Object.freeze({
    basename: normalizeRoutingPath(
      options?.basename,
      "basename",
      defaultRoutingOptions.basename,
    ),
    dataPath: normalizeRoutingPath(
      options?.dataPath,
      "dataPath",
      defaultRoutingOptions.dataPath,
    ),
  })
}

/** Remove the normalized app basename from a request pathname. */
export function stripBasename(
  pathname: string,
  basename: string,
): string | null {
  if (basename === "/") {
    return pathname
  }

  if (pathname === basename) {
    return "/"
  }

  if (!pathname.startsWith(`${basename}/`)) {
    return null
  }

  return pathname.slice(basename.length) || "/"
}

/** Prefix an app-relative route path with the normalized app basename. */
export function joinBasename(basename: string, pathname: string): string {
  if (basename === "/") {
    return pathname || "/"
  }

  if (pathname === "/") {
    return basename
  }

  return `${basename}${pathname.startsWith("/") ? pathname : `/${pathname}`}`
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`flamefront ${name} must be a non-empty string.`)
  }
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  location: string,
): void {
  const allowed = new Set(keys)
  const unexpected = Object.keys(value).find((key) => !allowed.has(key))

  if (unexpected) {
    throw new TypeError(
      `flamefront route ${location} hydration has an unexpected ${JSON.stringify(unexpected)} option.`,
    )
  }
}

function assertThreshold(value: unknown, location: string): void {
  const thresholds = Array.isArray(value) ? value : [value]

  if (
    thresholds.length === 0 ||
    thresholds.some(
      (threshold) =>
        typeof threshold !== "number" ||
        !Number.isFinite(threshold) ||
        threshold < 0 ||
        threshold > 1,
    )
  ) {
    throw new TypeError(
      `flamefront route ${location} hydration threshold must contain numbers from 0 through 1.`,
    )
  }
}

function validateGeneratedHydration(
  hydration: Record<string, unknown>,
  location: string,
): void {
  switch (hydration.when) {
    case "idle":
      assertOnlyKeys(hydration, ["when", "timeout"], location)
      if (
        hydration.timeout !== undefined &&
        (typeof hydration.timeout !== "number" ||
          !Number.isFinite(hydration.timeout) ||
          hydration.timeout < 0)
      ) {
        throw new TypeError(
          `flamefront route ${location} hydration timeout must be a non-negative number.`,
        )
      }

      return
    case "visible":
      assertOnlyKeys(hydration, ["when", "rootMargin", "threshold"], location)
      if (hydration.rootMargin !== undefined) {
        assertString(
          hydration.rootMargin,
          `route ${location} hydration rootMargin`,
        )
      }

      if (hydration.threshold !== undefined) {
        assertThreshold(hydration.threshold, location)
      }

      return
    case "interaction": {
      assertOnlyKeys(hydration, ["when", "events"], location)
      if (hydration.events === undefined) {
        return
      }

      const events = Array.isArray(hydration.events)
        ? hydration.events
        : [hydration.events]

      if (
        events.length === 0 ||
        events.some(
          (event) => typeof event !== "string" || !interactionEvents.has(event),
        )
      ) {
        throw new TypeError(
          `flamefront route ${location} hydration events must be supported Octane interaction events.`,
        )
      }

      return
    }

    case "media":
      assertOnlyKeys(hydration, ["when", "query"], location)
      assertString(hydration.query, `route ${location} hydration query`)
      return
    default:
      throw new TypeError(
        `flamefront route ${location} hydration trigger must be 'idle', 'visible', 'interaction', or 'media'.`,
      )
  }
}

function validateHydration(
  routeDefinition: RouteDefinition,
  location: string,
): void {
  const { hydration, render } = routeDefinition

  if (hydration === undefined) {
    return
  }

  if (
    typeof hydration === "object" &&
    hydration !== null &&
    !Array.isArray(hydration)
  ) {
    validateGeneratedHydration(
      hydration as unknown as Record<string, unknown>,
      location,
    )
    if (render !== "server" && render !== "static") {
      throw new TypeError(
        `flamefront route ${location} generated hydration requires render: 'server' or 'static'.`,
      )
    }

    return
  }

  if (!hydrationModes.has(hydration)) {
    throw new TypeError(
      `flamefront route ${location} hydration must be 'full', 'deferred', 'none', or a trigger object.`,
    )
  }

  if (render === "client" && hydration !== "full") {
    throw new TypeError(
      `flamefront route ${location} client hydration can only be 'full'.`,
    )
  }
}

function freezeHydration(
  hydration: HydrationMode | undefined,
): HydrationMode | undefined {
  if (typeof hydration !== "object" || hydration === null) {
    return hydration
  }

  if (hydration.when === "visible" && Array.isArray(hydration.threshold)) {
    return Object.freeze({
      ...hydration,
      threshold: Object.freeze([...hydration.threshold]),
    })
  }

  if (hydration.when === "interaction" && Array.isArray(hydration.events)) {
    return Object.freeze({
      ...hydration,
      events: Object.freeze([...hydration.events]),
    })
  }

  return Object.freeze({ ...hydration })
}

function validateRoute(
  routeDefinition: RouteDefinition,
  location: string,
): void {
  if (!routeDefinition || typeof routeDefinition !== "object") {
    throw new TypeError(`flamefront route ${location} must be an object.`)
  }

  assertString(routeDefinition.path, `route ${location} path`)
  if (!routeDefinition.path.startsWith("/")) {
    throw new TypeError(
      `flamefront route ${location} path must start with '/'.`,
    )
  }

  assertString(routeDefinition.entry, `route ${location} entry`)

  if (!renderModes.has(routeDefinition.render)) {
    throw new TypeError(
      `flamefront route ${location} render must be 'client', 'server', or 'static'.`,
    )
  }

  validateHydration(routeDefinition, location)
}

/** Define one explicit route without relying on a filesystem convention. */
export function route(
  path: string,
  entry: string,
  options: RouteOptions = {},
): RouteDefinition {
  const definition: RouteDefinition = {
    path,
    entry,
    ...options,
    hydration: freezeHydration(options.hydration),
    render: options.render ?? "server",
  }

  validateRoute(definition, "1")
  return Object.freeze(definition)
}

/** Group routes beneath a shared pathless layout without adding a URL segment. */
export function layout<const Children extends readonly RouteConfig[]>(
  entry: string,
  children: Children,
): LayoutDefinition<Children> {
  assertString(entry, "layout entry")
  if (!Array.isArray(children)) {
    throw new TypeError("flamefront layout children must be an array.")
  }

  return Object.freeze({
    kind: "layout" as const,
    entry,
    children: Object.freeze([...children]) as unknown as Children,
  })
}

function isLayoutDefinition(config: RouteConfig): config is LayoutDefinition {
  return "kind" in config && config.kind === "layout"
}

function normalizeRouteTree(
  configs: readonly RouteConfig[],
  seenPaths: Set<string>,
  location = "",
): { tree: readonly RouteConfig[]; routes: readonly RouteDefinition[] } {
  const routes: RouteDefinition[] = []
  const tree = configs.map((config, index): RouteConfig => {
    const configLocation = location
      ? `${location}.${index + 1}`
      : `${index + 1}`

    if (!config || typeof config !== "object") {
      throw new TypeError(
        `flamefront route ${configLocation} must be an object.`,
      )
    }

    if (isLayoutDefinition(config)) {
      assertString(config.entry, `layout ${configLocation} entry`)
      if (!Array.isArray(config.children)) {
        throw new TypeError(
          `flamefront layout ${configLocation} children must be an array.`,
        )
      }

      const normalized = normalizeRouteTree(
        config.children,
        seenPaths,
        configLocation,
      )

      routes.push(...normalized.routes)
      return Object.freeze({
        kind: "layout" as const,
        entry: config.entry,
        children: normalized.tree,
      })
    }

    validateRoute(config, configLocation)
    if (seenPaths.has(config.path)) {
      throw new TypeError(`flamefront route path is duplicated: ${config.path}`)
    }

    seenPaths.add(config.path)
    const normalizedRoute = Object.freeze({
      ...config,
      hydration: freezeHydration(config.hydration),
    })

    routes.push(normalizedRoute)
    return normalizedRoute
  })

  return { tree: Object.freeze(tree), routes: Object.freeze(routes) }
}

function createRouteMatcher<T extends RouteDefinition>(
  routes: readonly T[],
  render?: RenderMode,
): MultiMatcher<T> {
  const matcher = createMultiMatcher<T>()

  for (const routeDefinition of routes) {
    if (render === undefined || routeDefinition.render === render) {
      matcher.add(routeDefinition.path, routeDefinition)
    }
  }

  return matcher
}

function matchRoutes<T extends RouteDefinition>(
  routes: readonly T[],
  url: string | URL,
  options: MatchRouteOptions = {},
  basename = "/",
): Match<string, T> | null {
  let matchers = matcherCache.get(routes)

  if (!matchers) {
    matchers = new Map()
    matcherCache.set(routes, matchers)
  }

  let matcher = matchers.get(options.render) as MultiMatcher<T> | undefined

  if (!matcher) {
    matcher = createRouteMatcher(routes, options.render)
    matchers.set(options.render, matcher as MultiMatcher<RouteDefinition>)
  }

  const normalizedUrl = new URL(url, "http://flamefront.local")
  const appPathname = stripBasename(normalizedUrl.pathname, basename)

  if (appPathname === null) {
    return null
  }

  normalizedUrl.pathname = appPathname
  if (normalizedUrl.pathname.length > 1) {
    normalizedUrl.pathname = normalizedUrl.pathname.replace(/\/+$/, "")
  }

  return matcher.match(normalizedUrl)
}

/** Normalize and validate the application's explicit route graph. */
export function defineApp<
  const T extends {
    readonly shell: string
    readonly routes: readonly RouteConfig[]
    readonly routing?: RoutingOptions
  },
>(options: T): Omit<T, "routes" | "routing"> & AppDefinition {
  if (
    !options ||
    typeof options !== "object" ||
    !Array.isArray(options.routes)
  ) {
    throw new TypeError("flamefront defineApp() requires a routes array.")
  }

  assertString(options.shell, "app shell entry")

  const normalized = normalizeRouteTree(options.routes, new Set())
  const frozenRoutes = normalized.routes
  const routing = normalizeRoutingOptions(options.routing)
  const routeDataClient = createRouteDataClient(routing)
  const load = <Data = unknown>(
    url: string | URL,
    loadOptions: LoadRouteOptions = {},
  ) => {
    const match = matchRoutes(frozenRoutes, url, {}, routing.basename)
    const source = match?.data.render === "static" ? "static" : "live"

    return routeDataClient.load<Data>(url, source, loadOptions)
  }

  const app = Object.freeze({
    ...options,
    routes: frozenRoutes,
    routeTree: normalized.tree,
    routing,
    match: (url: string | URL, matchOptions?: MatchRouteOptions) =>
      matchRoutes(frozenRoutes, url, matchOptions, routing.basename),
    load,
    prefetch: async (url: string | URL, loadOptions?: LoadRouteOptions) => {
      await load(url, loadOptions)
    },
  }) as Omit<T, "routes" | "routing"> & AppDefinition

  matcherCache.set(
    frozenRoutes,
    new Map([[undefined, createRouteMatcher(frozenRoutes)]]) as Map<
      RenderMode | undefined,
      MultiMatcher<RouteDefinition>
    >,
  )
  return app
}
