export type RouteDataSource = "live" | "static"

export interface RouteDataRoutingOptions {
  readonly basename?: string
  readonly dataPath?: string
}

export interface RouteDataLoadOptions {
  readonly signal?: AbortSignal
  readonly reload?: boolean
}

export interface RouteDataClient {
  readonly load: <Data = unknown>(
    url: string | URL,
    source: RouteDataSource,
    options?: RouteDataLoadOptions,
  ) => Promise<Data>
  readonly prefetch: (
    url: string | URL,
    source: RouteDataSource,
    options?: RouteDataLoadOptions,
  ) => Promise<void>
}

const defaultRouting = Object.freeze({
  basename: "/",
  dataPath: "/__flamefront/data",
})

/**
 * Browser route-data clients share one cache per routing configuration so
 * app.prefetch() and generated router loaders can consume the same promise.
 * Server callers receive an isolated client to avoid a process-wide browser
 * cache; server rendering invokes route loaders directly instead.
 */
const browserClients = new Map<string, RouteDataClient>()

function normalizePath(value: string | undefined, fallback: string): string {
  return value?.replace(/\/+$/, "") || fallback
}

function normalizeRouting(options: RouteDataRoutingOptions): {
  readonly basename: string
  readonly dataPath: string
} {
  return {
    basename: normalizePath(options.basename, defaultRouting.basename),
    dataPath: normalizePath(options.dataPath, defaultRouting.dataPath),
  }
}

function resolveRouteUrl(url: string | URL): URL {
  const browserOrigin =
    typeof location === "undefined" ? undefined : location.origin

  if (!browserOrigin && typeof url === "string" && !URL.canParse(url)) {
    throw new TypeError(
      "flamefront route data requires an absolute URL outside the browser.",
    )
  }

  return new URL(url, browserOrigin)
}

function stripBasename(pathname: string, basename: string): string | null {
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

function joinBasename(basename: string, pathname: string): string {
  if (basename === "/") {
    return pathname || "/"
  }

  if (pathname === "/") {
    return basename
  }

  return `${basename}${pathname.startsWith("/") ? pathname : `/${pathname}`}`
}

function staticRouteDataPath(routeUrl: URL, basename: string): string {
  const appPathname =
    stripBasename(routeUrl.pathname, basename) ?? routeUrl.pathname
  const pathname = joinBasename(basename, appPathname).replace(/\/+$/, "")

  return pathname === "" ? "/index.data.json" : `${pathname}/index.data.json`
}

function cacheKey(routeUrl: URL, source: RouteDataSource): string {
  return `${source}:${routeUrl.origin}${routeUrl.pathname}${routeUrl.search}`
}

function abortable<Data>(
  pending: Promise<Data>,
  signal: AbortSignal | undefined,
): Promise<Data> {
  if (!signal) {
    return pending
  }

  if (signal.aborted) {
    return Promise.reject(signal.reason)
  }

  return new Promise<Data>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)

    signal.addEventListener("abort", onAbort, { once: true })
    pending.then(
      (value) => {
        signal.removeEventListener("abort", onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener("abort", onAbort)
        reject(error)
      },
    )
  })
}

function createIsolatedRouteDataClient(routing: {
  readonly basename: string
  readonly dataPath: string
}): RouteDataClient {
  const cache = new Map<string, Promise<unknown>>()

  const load = <Data = unknown>(
    url: string | URL,
    source: RouteDataSource,
    options: RouteDataLoadOptions = {},
  ): Promise<Data> => {
    const routeUrl = resolveRouteUrl(url)
    const key = cacheKey(routeUrl, source)

    if (options.reload) {
      cache.delete(key)
    }

    const cached = cache.get(key)

    if (cached) {
      return abortable(cached as Promise<Data>, options.signal)
    }

    const endpoint =
      source === "static"
        ? new URL(
            staticRouteDataPath(routeUrl, routing.basename),
            routeUrl.origin,
          )
        : new URL(routing.dataPath, routeUrl.origin)

    if (source === "live") {
      endpoint.searchParams.set("url", routeUrl.href)
    }

    const pending = globalThis
      .fetch(endpoint, options.signal ? { signal: options.signal } : undefined)
      .then(async (response) => {
        if (!response.ok) {
          const label = source === "static" ? "static route data" : "loader"

          throw new Error(
            `flamefront ${label} request failed with ${response.status}.`,
          )
        }

        return response.json() as Promise<Data>
      })

    cache.set(key, pending)
    void pending.catch(() => {
      if (cache.get(key) === pending) {
        cache.delete(key)
      }
    })
    return abortable(pending, options.signal)
  }

  return {
    load,
    prefetch: async (url, source, options) => {
      await load(url, source, options)
    },
  }
}

export function createRouteDataClient(
  options: RouteDataRoutingOptions = {},
): RouteDataClient {
  const routing = normalizeRouting(options)

  if (typeof window === "undefined") {
    return createIsolatedRouteDataClient(routing)
  }

  const key = `${routing.basename}\u0000${routing.dataPath}`
  const existing = browserClients.get(key)

  if (existing) {
    return existing
  }

  const client = createIsolatedRouteDataClient(routing)

  browserClients.set(key, client)
  return client
}
