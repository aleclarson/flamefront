import type { RouteDefinition } from "./index.ts"

export type {
  FetchMiddleware,
  FetchServerAssets,
  FetchServerEntryOptions,
  FlamefrontFetchServerEntry,
  ResponseHeaders,
  ResponseHeadersContext,
  ResponseHeadersHook,
  ServerDocuments,
  ServerEntryLifecycle,
  StaticFragmentContext,
  StaticFragmentLoader,
  TemplateContext,
  TemplateLoader,
} from "./fetch.ts"
export type {
  FlamefrontServerEntry,
  ServerAssets,
  SrvxMiddleware,
  SrvxServerEntryOptions,
} from "./srvx.ts"

import type {
  FetchServerEntryOptions,
  FlamefrontFetchServerEntry,
} from "./fetch.ts"
import type { FlamefrontServerEntry, SrvxServerEntryOptions } from "./srvx.ts"

export type ServerEntryOptions<
  Route extends RouteDefinition = RouteDefinition,
> = FetchServerEntryOptions<Route> | SrvxServerEntryOptions<Route>

export type ServerEntry = FlamefrontFetchServerEntry | FlamefrontServerEntry

/**
 * Create the server entry selected by the `flamefront` Vite plugin options.
 * Vite replaces this placeholder with the generated adapter module at build
 * time; the direct-import error prevents an accidental unconfigured entry.
 */
export function createServerEntry<
  Route extends RouteDefinition = RouteDefinition,
>(options: ServerEntryOptions<Route>): ServerEntry {
  void options
  throw new Error(
    "flamefront/entry must be loaded through the flamefront Vite plugin.",
  )
}
