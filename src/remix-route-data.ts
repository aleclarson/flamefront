import {
  createRouteDataClient,
  type RouteDataLoadOptions,
  type RouteDataRoutingOptions,
} from "./route-data-client.ts"
import type { RouteDataForPath } from "./index.ts"
import {
  loadRouteFragment as loadFragmentArtifact,
  type RouteFragmentCachePolicy,
  type RouteFragmentLoadOptions,
  type RouteFragmentRoutingOptions,
} from "./fragment-client.ts"

export {
  createRouteDataClient,
  type RouteDataClient,
  type RouteDataLoadOptions,
  type RouteDataRoutingOptions,
  type RouteDataSource,
} from "./route-data-client.ts"

export interface ClientLoaderArgs<_Path extends string = string> {
  readonly request: Request
}

export interface RouteDataOptions {
  readonly basename?: string
  readonly dataPath?: string
}

function client(options: RouteDataOptions) {
  return createRouteDataClient(options satisfies RouteDataRoutingOptions)
}

/** Load route data through Flamefront's server endpoint during browser navigation. */
export async function loadRouteData<const Path extends string = string>(
  { request }: ClientLoaderArgs<Path>,
  options: RouteDataOptions = {},
): Promise<RouteDataForPath<Path>> {
  const loadOptions: RouteDataLoadOptions = { signal: request.signal }

  return client(options).load(request.url, "live", loadOptions) as Promise<
    RouteDataForPath<Path>
  >
}

/** Load a build-time static route artifact during browser navigation. */
export async function loadStaticRouteData<const Path extends string = string>(
  { request }: ClientLoaderArgs<Path>,
  options: RouteDataOptions = {},
): Promise<RouteDataForPath<Path>> {
  const loadOptions: RouteDataLoadOptions = { signal: request.signal }

  return client(options).load(request.url, "static", loadOptions) as Promise<
    RouteDataForPath<Path>
  >
}

/** Load a route fragment and expose only its route data to the router. */
export async function loadRouteFragment<const Path extends string = string>(
  { request }: ClientLoaderArgs<Path>,
  options: RouteDataOptions = {},
  policy: RouteFragmentCachePolicy = "static",
): Promise<RouteDataForPath<Path>> {
  const fragmentOptions: RouteFragmentLoadOptions = {
    policy,
    signal: request.signal,
  }
  const artifact = await loadFragmentArtifact(
    request.url,
    options satisfies RouteFragmentRoutingOptions,
    fragmentOptions,
  )

  return artifact.routeData as RouteDataForPath<Path>
}
