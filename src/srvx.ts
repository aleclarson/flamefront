import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import { staticMiddleware } from "srvx/static"
import type { ServerMiddleware, ServerOptions } from "srvx"
import {
  stripBasename,
  type AppDefinition,
  type RouteDefinition,
} from "./index.ts"
import { isRouteFragmentRequest } from "./fragment-protocol.ts"
import {
  createFetchServerEntry,
  type ResponseHeadersHook,
  type ServerDocuments,
  type ServerEntryLifecycle,
  type TemplateLoader,
} from "./fetch.ts"
import { staticRouteFragmentDataFile } from "./static-fragment-artifacts.ts"

export type {
  FetchMiddleware,
  FetchServerAssets,
  FetchServerEntryOptions,
  FlamefrontFetchServerEntry,
  ResponseHeaders,
  ResponseHeadersContext,
  ResponseHeadersHook,
  ServerDocuments,
  StaticFragmentContext,
  StaticFragmentLoader,
  TemplateContext,
  TemplateLoader,
} from "./fetch.ts"

export type SrvxMiddleware = ServerMiddleware

/** Client asset location and the optional replacement for template lookup. */
export interface ServerAssets<Route extends RouteDefinition = RouteDefinition> {
  readonly clientDirectory: string | URL
  readonly loadTemplate?: TemplateLoader<Route>
}

export type { ServerEntryLifecycle }

/** The single default-export value consumed by Flamefront's lifecycle. */
export type FlamefrontServerEntry = ServerOptions & ServerEntryLifecycle

/** Inputs for composing the transport around an Octane document service. */
export interface SrvxServerEntryOptions<
  Route extends RouteDefinition = RouteDefinition,
> {
  readonly app: AppDefinition<Route>
  readonly documents: ServerDocuments
  readonly assets: ServerAssets<Route>
  /** Applied outermost first, in declaration order, around framework transport. */
  readonly middleware?: readonly SrvxMiddleware[]
  readonly headers?: ResponseHeadersHook<Route>
}

function asPath(directory: string | URL): string {
  return directory instanceof URL ? fileURLToPath(directory) : directory
}

async function loadDefaultTemplate(clientDirectory: string): Promise<string> {
  let lastError: unknown
  const candidates = [
    resolve(clientDirectory, "..", "server", "index.html"),
    resolve(clientDirectory, "index.html"),
    resolve(clientDirectory, "..", "index.html"),
  ]

  for (const filename of candidates) {
    try {
      return await readFile(filename, "utf8")
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

function staticRequest(request: Request, basename: string): Request {
  if (
    basename === "/" ||
    (request.method !== "GET" && request.method !== "HEAD")
  ) {
    return request
  }

  const url = new URL(request.url)
  const pathname = stripBasename(url.pathname, basename)

  if (!pathname || pathname === url.pathname) {
    return request
  }

  url.pathname = pathname
  return new Request(url, request)
}

/**
 * Compose the srvx transport and the mode-aware document/data lifecycle into
 * the one default server entry consumed by Flamefront's lifecycle.
 */
export function createSrvxServerEntry<
  Route extends RouteDefinition = RouteDefinition,
>(options: SrvxServerEntryOptions<Route>): FlamefrontServerEntry {
  const clientDirectory = asPath(options.assets.clientDirectory)
  const loadTemplate =
    options.assets.loadTemplate ?? (() => loadDefaultTemplate(clientDirectory))
  const serveClientFile = staticMiddleware({ dir: clientDirectory })

  const frameworkMiddleware: SrvxMiddleware = (request, next) => {
    const url = new URL(request.url)

    if (isRouteFragmentRequest(url)) {
      return next()
    }

    if (url.pathname === options.app.routing.dataPath) {
      return next()
    }

    const match = options.app.match(url)

    if (url.pathname === options.app.routing.basename && !match) {
      return next()
    }

    if (match?.data.render === "client" || match?.data.render === "server") {
      return next()
    }

    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      return next()
    }

    return serveClientFile(
      staticRequest(request, options.app.routing.basename),
      next,
    )
  }

  const fetchEntry = createFetchServerEntry({
    app: options.app,
    documents: options.documents,
    assets: {
      loadTemplate,
      loadStaticFragment: async ({ route }) => {
        try {
          return JSON.parse(
            await readFile(
              staticRouteFragmentDataFile(clientDirectory, route),
              "utf8",
            ),
          )
        } catch (error) {
          if ((error as { code?: string }).code !== "ENOENT") {
            throw error
          }

          return undefined
        }
      },
    },
    headers: options.headers,
  })

  return {
    fetch: fetchEntry.fetch,
    middleware: [...(options.middleware ?? []), frameworkMiddleware],
    renderDocument: fetchEntry.renderDocument,
    loadRouteData: fetchEntry.loadRouteData,
    ...(fetchEntry.loadAction ? { loadAction: fetchEntry.loadAction } : {}),
    renderFragment: fetchEntry.renderFragment,
  }
}
