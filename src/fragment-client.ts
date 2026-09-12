import type { HydrationMode, RouteBoundaryKind } from "./index.ts"
import {
  stripFlamefrontProtocolParams,
  withRouteFragmentProtocol,
} from "./fragment-protocol.ts"

export const routeFragmentProtocol = "flamefront-route-fragment-v1" as const

export type RouteFragmentCachePolicy = "server" | "static"

export interface RouteFragmentBoundary {
  readonly id: string
  readonly boundary: string
  readonly kind: RouteBoundaryKind
  readonly parent?: string
  readonly html: string
}

export interface RouteFragmentArtifact {
  readonly protocol: typeof routeFragmentProtocol
  readonly route: string
  readonly boundary: string
  readonly html: string
  readonly routeData: unknown
  readonly boundaries: readonly RouteFragmentBoundary[]
  readonly hydration?: HydrationMode
  readonly status?: number
}

export interface RouteFragmentLoadOptions {
  readonly policy: RouteFragmentCachePolicy
  readonly signal?: AbortSignal
  readonly reload?: boolean
}

export interface RouteFragmentRoutingOptions {
  readonly basename?: string
}

export function shouldHydrateRouteFragment(
  hydration: HydrationMode | undefined,
): boolean {
  return hydration !== "none"
}

const staticFragmentRequests = new Map<string, Promise<RouteFragmentArtifact>>()
const serverFragmentRequests = new Map<string, Promise<RouteFragmentArtifact>>()
const latestRouteFragments = new Map<string, RouteFragmentArtifact>()
let fragmentGeneration = 0

function resolveRouteUrl(input: string | URL): URL {
  const browserOrigin =
    typeof location === "undefined" ? undefined : location.origin

  if (!browserOrigin && typeof input === "string" && !URL.canParse(input)) {
    throw new TypeError(
      "flamefront route fragments require an absolute URL outside the browser.",
    )
  }

  return stripFlamefrontProtocolParams(new URL(input, browserOrigin))
}

function basenamePath(pathname: string, basename: string): string | null {
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

function staticFragmentKey(url: URL, basename: string): string {
  const pathname = basenamePath(url.pathname, basename) ?? url.pathname

  return `${url.origin}${pathname}`
}

function routeFragmentKey(url: URL, basename = "/"): string {
  const pathname = basenamePath(url.pathname, basename) ?? url.pathname

  return `${url.origin}${pathname}${url.search}${url.hash}`
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

export function isRouteFragmentArtifact(
  value: unknown,
): value is RouteFragmentArtifact {
  if (!value || typeof value !== "object") {
    return false
  }

  const artifact = value as Partial<RouteFragmentArtifact>

  return (
    artifact.protocol === routeFragmentProtocol &&
    typeof artifact.route === "string" &&
    typeof artifact.boundary === "string" &&
    typeof artifact.html === "string" &&
    Array.isArray(artifact.boundaries)
  )
}

export function assertRouteFragmentArtifact(
  value: unknown,
): RouteFragmentArtifact {
  if (!isRouteFragmentArtifact(value)) {
    throw new Error(
      "flamefront route fragment response has an invalid protocol.",
    )
  }

  return value
}

export function getRouteFragment(
  url: string | URL,
  routing: RouteFragmentRoutingOptions = {},
): RouteFragmentArtifact | undefined {
  return latestRouteFragments.get(
    routeFragmentKey(resolveRouteUrl(url), routing.basename ?? "/"),
  )
}

/** Drop browser fragment state after a successful mutation. */
export function invalidateRouteFragments(): void {
  fragmentGeneration += 1
  serverFragmentRequests.clear()
  latestRouteFragments.clear()
}

function fetchRouteFragment(
  routeUrl: URL,
  basename: string,
  signal: AbortSignal | undefined,
): Promise<RouteFragmentArtifact> {
  const endpoint = withRouteFragmentProtocol(routeUrl)

  return globalThis
    .fetch(endpoint, {
      headers: { Accept: "application/vnd.flamefront.fragment+json" },
      ...(signal ? { signal } : {}),
    })
    .then(async (response) => {
      if (response.redirected) {
        const location = stripFlamefrontProtocolParams(response.url)
        const pathname =
          basenamePath(location.pathname, basename) ?? location.pathname

        throw new Response(null, {
          status: 302,
          headers: {
            Location: `${pathname}${location.search}${location.hash}`,
          },
        })
      }

      if (response.status >= 300 && response.status < 400) {
        throw response
      }

      let value: unknown

      try {
        value = await response.json()
      } catch {
        if (!response.ok) {
          throw new Error(
            `flamefront route fragment request failed with ${response.status}.`,
          )
        }

        throw new Error(
          "flamefront route fragment response has an invalid protocol.",
        )
      }

      return assertRouteFragmentArtifact(value)
    })
}

export function loadRouteFragment(
  url: string | URL,
  routing: RouteFragmentRoutingOptions = {},
  options: RouteFragmentLoadOptions,
): Promise<RouteFragmentArtifact> {
  const routeUrl = resolveRouteUrl(url)
  const generation = fragmentGeneration
  const handoffKey = routeFragmentKey(routeUrl, routing.basename ?? "/")
  const requests =
    options.policy === "static"
      ? staticFragmentRequests
      : serverFragmentRequests
  const requestKey =
    options.policy === "static"
      ? staticFragmentKey(routeUrl, routing.basename ?? "/")
      : routeUrl.href

  if (options.reload) {
    requests.delete(requestKey)
  }

  let pending = requests.get(requestKey)

  if (!pending) {
    pending = fetchRouteFragment(
      routeUrl,
      routing.basename ?? "/",
      options.signal,
    )
    requests.set(requestKey, pending)

    const evict = () => {
      if (requests.get(requestKey) === pending) {
        requests.delete(requestKey)
      }
    }

    if (options.policy === "static") {
      void pending.catch(evict)
    } else {
      void pending.then(evict, evict)
    }
  }

  return abortable(pending, options.signal).then((artifact) => {
    if (generation === fragmentGeneration) {
      latestRouteFragments.set(handoffKey, artifact)
    }

    return artifact
  })
}

export async function prefetchRouteFragment(
  url: string | URL,
  policy: RouteFragmentCachePolicy,
  routing: RouteFragmentRoutingOptions = {},
  options: Omit<RouteFragmentLoadOptions, "policy"> = {},
): Promise<void> {
  await loadRouteFragment(url, routing, { ...options, policy })
}

export type {
  GeneratedHydration,
  GeneratedRouteMetadata,
  HydrationMode,
} from "./index.ts"
