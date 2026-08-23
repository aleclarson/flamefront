import type {
  GeneratedHydration,
  GeneratedRouteMetadata,
  HydrationMode,
  RouteBoundaryKind,
} from "./index.ts"
import {
  stripFlamefrontProtocolParams,
  withStaticFragmentProtocol,
} from "./fragment-protocol.ts"

export const staticFragmentProtocol = "flamefront-static-fragment-v1" as const

export interface StaticFragmentBoundary {
  readonly id: string
  readonly boundary: string
  readonly kind: RouteBoundaryKind
  readonly parent?: string
  readonly html: string
}

export interface StaticFragmentArtifact {
  readonly protocol: typeof staticFragmentProtocol
  readonly route: string
  readonly boundary: string
  readonly html: string
  readonly routeData: unknown
  readonly boundaries: readonly StaticFragmentBoundary[]
  readonly hydration?: HydrationMode
  readonly status?: number
}

export interface StaticFragmentLoadOptions {
  readonly signal?: AbortSignal
  readonly reload?: boolean
}

export interface StaticFragmentRoutingOptions {
  readonly basename?: string
}

export function shouldHydrateStaticFragment(
  hydration: HydrationMode | undefined,
): boolean {
  return hydration !== "none"
}

const fragmentCache = new Map<string, Promise<StaticFragmentArtifact>>()

function resolveRouteUrl(input: string | URL): URL {
  const browserOrigin =
    typeof location === "undefined" ? undefined : location.origin

  if (!browserOrigin && typeof input === "string" && !URL.canParse(input)) {
    throw new TypeError(
      "flamefront static fragments require an absolute URL outside the browser.",
    )
  }

  return new URL(input, browserOrigin)
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

function fragmentKey(input: string | URL, basename = "/"): string {
  const url = stripFlamefrontProtocolParams(resolveRouteUrl(input))
  const pathname = basenamePath(url.pathname, basename) ?? url.pathname

  return `${url.origin}${pathname}`
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

export function isStaticFragmentArtifact(
  value: unknown,
): value is StaticFragmentArtifact {
  if (!value || typeof value !== "object") {
    return false
  }

  const artifact = value as Partial<StaticFragmentArtifact>

  return (
    artifact.protocol === staticFragmentProtocol &&
    typeof artifact.route === "string" &&
    typeof artifact.boundary === "string" &&
    typeof artifact.html === "string" &&
    Array.isArray(artifact.boundaries)
  )
}

export function assertStaticFragmentArtifact(
  value: unknown,
): StaticFragmentArtifact {
  if (!isStaticFragmentArtifact(value)) {
    throw new Error(
      "flamefront static fragment response has an invalid protocol.",
    )
  }

  return value
}

export function getStaticFragment(
  url: string | URL,
  routing: StaticFragmentRoutingOptions = {},
): StaticFragmentArtifact | undefined {
  const pending = fragmentCache.get(fragmentKey(url, routing.basename ?? "/"))

  return pending && "value" in pending
    ? (
        pending as Promise<StaticFragmentArtifact> & {
          value?: StaticFragmentArtifact
        }
      ).value
    : undefined
}

function rememberArtifact(
  key: string,
  pending: Promise<StaticFragmentArtifact>,
): Promise<StaticFragmentArtifact> {
  const tracked = pending.then((artifact) => {
    ;(
      tracked as Promise<StaticFragmentArtifact> & {
        value?: StaticFragmentArtifact
      }
    ).value = artifact
    return artifact
  })

  fragmentCache.set(key, tracked)
  void tracked.catch(() => {
    if (fragmentCache.get(key) === tracked) {
      fragmentCache.delete(key)
    }
  })
  return tracked
}

export function loadStaticFragment(
  url: string | URL,
  routing: StaticFragmentRoutingOptions = {},
  options: StaticFragmentLoadOptions = {},
): Promise<StaticFragmentArtifact> {
  const routeUrl = resolveRouteUrl(url)
  const key = fragmentKey(routeUrl, routing.basename ?? "/")

  if (options.reload) {
    fragmentCache.delete(key)
  }

  const cached = fragmentCache.get(key)

  if (cached) {
    return abortable(cached, options.signal)
  }

  const endpoint = withStaticFragmentProtocol(routeUrl)
  const pending = globalThis
    .fetch(endpoint, {
      headers: { Accept: "application/vnd.flamefront.fragment+json" },
      ...(options.signal ? { signal: options.signal } : {}),
    })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `flamefront static fragment request failed with ${response.status}.`,
        )
      }

      return assertStaticFragmentArtifact(await response.json())
    })

  return abortable(rememberArtifact(key, pending), options.signal)
}

export async function prefetchStaticFragment(
  url: string | URL,
  routing: StaticFragmentRoutingOptions = {},
  options?: StaticFragmentLoadOptions,
): Promise<void> {
  await loadStaticFragment(url, routing, options)
}

export type {
  GeneratedHydration,
  GeneratedRouteMetadata,
  HydrationMode,
} from "./index.ts"
