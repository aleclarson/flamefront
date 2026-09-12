import {
  joinBasename,
  type AppDefinition,
  type RouteDefinition,
} from "./index.ts"
import type { OctaneDocuments } from "./octane.tsx"
import type { DocumentMode, RenderedDocument } from "./server.ts"
import {
  isRouteFragmentRequest,
  stripFlamefrontProtocolRequest,
} from "./fragment-protocol.ts"
import type { RouteFragmentArtifact } from "./fragment-client.ts"
import { isSameOriginActionRequest } from "./action.ts"

export interface TemplateContext<
  Route extends RouteDefinition = RouteDefinition,
> {
  readonly request: Request
  readonly route: Route | null
  readonly mode: DocumentMode
}

export type TemplateLoader<Route extends RouteDefinition = RouteDefinition> = (
  context: TemplateContext<Route>,
) => string | Promise<string>

export interface StaticFragmentContext<
  Route extends RouteDefinition = RouteDefinition,
> {
  readonly request: Request
  readonly route: Route
}

/** Load a pre-rendered static fragment from the host's asset system. */
export type StaticFragmentLoader<
  Route extends RouteDefinition = RouteDefinition,
> = (
  context: StaticFragmentContext<Route>,
) =>
  RouteFragmentArtifact | undefined | Promise<RouteFragmentArtifact | undefined>

export interface ResponseHeadersContext<
  Route extends RouteDefinition = RouteDefinition,
> {
  readonly request: Request
  readonly route: Route | null
  readonly mode: DocumentMode
  readonly document: RenderedDocument
}

export type ResponseHeaders = HeadersInit

/** Add or override response headers after document rendering. */
export type ResponseHeadersHook<
  Route extends RouteDefinition = RouteDefinition,
> = (
  context: ResponseHeadersContext<Route>,
) => ResponseHeaders | Promise<ResponseHeaders>

export type FetchMiddleware = (
  request: Request,
  next: () => Response | Promise<Response>,
) => Response | Promise<Response>

export type ServerDocuments = Pick<
  OctaneDocuments,
  "renderDocument" | "loadRouteData"
> &
  Partial<Pick<OctaneDocuments, "renderFragment" | "loadAction">>

/** Lifecycle operations shared by all Flamefront server adapters. */
export interface ServerEntryLifecycle {
  readonly renderDocument: OctaneDocuments["renderDocument"]
  readonly loadRouteData: OctaneDocuments["loadRouteData"]
  readonly loadAction?: OctaneDocuments["loadAction"]
  readonly renderFragment?: OctaneDocuments["renderFragment"]
}

/** A Web Fetch-compatible server entry. */
export interface FlamefrontFetchServerEntry extends ServerEntryLifecycle {
  readonly fetch: (request: Request) => Response | Promise<Response>
}

export interface FetchServerAssets<
  Route extends RouteDefinition = RouteDefinition,
> {
  readonly loadTemplate: TemplateLoader<Route>
  readonly loadStaticFragment?: StaticFragmentLoader<Route>
}

export interface FetchServerEntryOptions<
  Route extends RouteDefinition = RouteDefinition,
> {
  readonly app: AppDefinition<Route>
  readonly documents: ServerDocuments
  readonly assets: FetchServerAssets<Route>
  /** Applied outermost first, in declaration order. */
  readonly middleware?: readonly FetchMiddleware[]
  readonly headers?: ResponseHeadersHook<Route>
}

function mergeHeaders(target: Headers, source: HeadersInit | undefined): void {
  if (source === undefined) {
    return
  }

  for (const [name, value] of new Headers(source)) {
    target.set(name, value)
  }
}

function composeMiddleware(
  middleware: readonly FetchMiddleware[],
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return middleware.reduceRight<(request: Request) => Promise<Response>>(
    (next, current) => async (request) => current(request, () => next(request)),
    handler,
  )
}

/**
 * Create the transport-neutral Flamefront request handler. Hosts can expose
 * the returned `fetch` function directly or wrap it in their own adapter.
 */
export function createFetchServerEntry<
  Route extends RouteDefinition = RouteDefinition,
>(options: FetchServerEntryOptions<Route>): FlamefrontFetchServerEntry {
  const defaultClientRoute = options.app.routes.find(
    (route) => route.render === "client",
  )

  const handleRequest = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const match = options.app.match(url)

    try {
      if (
        !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
        !isSameOriginActionRequest(request)
      ) {
        return new Response("Forbidden.", { status: 403 })
      }

      if (
        url.pathname === options.app.routing.basename &&
        !match &&
        defaultClientRoute
      ) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: joinBasename(
              options.app.routing.basename,
              defaultClientRoute.path,
            ),
          },
        })
      }

      if (
        url.searchParams.has("action") ||
        url.searchParams.has("__flamefront_action")
      ) {
        if (!options.documents.loadAction) {
          return new Response("Actions are not configured.", { status: 404 })
        }

        return options.documents.loadAction(request)
      }

      if (
        !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
        match?.data.render === "static"
      ) {
        return options.documents.loadAction
          ? options.documents.loadAction(request)
          : new Response(
              "Static routes cannot define actions; submit to a server route instead.",
              { status: 405 },
            )
      }

      if (url.pathname === options.app.routing.dataPath) {
        return options.documents.loadRouteData(request)
      }

      if (isRouteFragmentRequest(url)) {
        const sanitizedRequest = stripFlamefrontProtocolRequest(request)
        const fragmentMatch = options.app.match(sanitizedRequest.url)

        if (!fragmentMatch || fragmentMatch.data.render === "client") {
          return new Response("Not found", { status: 404 })
        }

        let artifact: RouteFragmentArtifact | undefined

        if (
          fragmentMatch.data.render === "static" &&
          options.assets.loadStaticFragment
        ) {
          artifact = await options.assets.loadStaticFragment({
            request: sanitizedRequest,
            route: fragmentMatch.data,
          })
        }

        if (!artifact && options.documents.renderFragment) {
          artifact = await options.documents.renderFragment(sanitizedRequest)
        }

        if (!artifact) {
          return new Response("Not found", { status: 404 })
        }

        const responseHeaders = new Headers({
          "Content-Type":
            "application/vnd.flamefront.fragment+json; charset=utf-8",
        })

        if (options.headers) {
          mergeHeaders(
            responseHeaders,
            await options.headers({
              request: sanitizedRequest,
              route: fragmentMatch.data,
              mode: fragmentMatch.data.render,
              document: {
                html: artifact.html,
                routeData: artifact.routeData,
                status: artifact.status,
              },
            }),
          )
        }

        return new Response(JSON.stringify(artifact), {
          status: artifact.status ?? 200,
          headers: responseHeaders,
        })
      }

      if (!match) {
        return new Response("Not found", { status: 404 })
      }

      const mode: DocumentMode = url.searchParams.has("__flamefront_shell")
        ? "shell"
        : match.data.render
      const template = await options.assets.loadTemplate({
        request,
        route: match.data,
        mode,
      })
      const document = await options.documents.renderDocument(
        template,
        request,
        { mode },
      )
      const responseHeaders = new Headers({
        "Content-Type": "text/html; charset=utf-8",
      })

      mergeHeaders(responseHeaders, document.headers)
      if (options.headers) {
        mergeHeaders(
          responseHeaders,
          await options.headers({
            request,
            route: match.data,
            mode,
            document,
          }),
        )
      }

      return new Response(document.html, {
        status: document.status ?? 200,
        headers: responseHeaders,
      })
    } catch (error) {
      if (error instanceof Response) {
        return error
      }

      throw error
    }
  }

  const composedFetch = composeMiddleware(
    options.middleware ?? [],
    handleRequest,
  )
  const fetch = async (request: Request): Promise<Response> => {
    try {
      return await composedFetch(request)
    } catch (error) {
      if (error instanceof Response) {
        return error
      }

      throw error
    }
  }

  return {
    fetch,
    renderDocument: options.documents.renderDocument,
    loadRouteData: options.documents.loadRouteData,
    ...(options.documents.loadAction
      ? { loadAction: options.documents.loadAction }
      : {}),
    renderFragment: options.documents.renderFragment,
  }
}
