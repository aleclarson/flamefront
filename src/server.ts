import {
  type AppDefinition,
  type MatchRouteOptions,
  type RouteLoaderFor,
  type RenderMode,
  type RouteLoaderData,
  type RouteMatchForUrl,
  type RouteParams,
  type RouteDefinition,
} from "./index.ts"
import { stripFlamefrontProtocolRequest } from "./fragment-protocol.ts"
import {
  actionErrorResponse,
  actionResultResponse,
  executeRegisteredAction,
  getRegisteredAction,
  isSameOriginActionRequest,
  parseActionArguments,
} from "./action.ts"

export { action } from "./action.ts"
export type {
  ActionDataWithResponseInit,
  ActionFunction,
  ActionInput,
  ActionOutput,
  ActionValidationError,
  StandardSchema,
  StandardSchemaIssue,
  StandardSchemaV1,
} from "./action.ts"
export { data, redirect } from "@octanejs/remix-router"

type LoaderPath<ContextOrPath, PathOrContext> =
  ContextOrPath extends `/${string}`
    ? ContextOrPath
    : PathOrContext extends `/${string}`
      ? PathOrContext
      : string

type LoaderContext<ContextOrPath, PathOrContext> =
  ContextOrPath extends `/${string}`
    ? PathOrContext extends `/${string}`
      ? unknown
      : PathOrContext
    : ContextOrPath

export interface LoaderArgs<ContextOrPath = unknown, PathOrContext = unknown> {
  readonly request: Request
  readonly params: Readonly<
    RouteParams<LoaderPath<ContextOrPath, PathOrContext>>
  >
  readonly context: LoaderContext<ContextOrPath, PathOrContext>
}

/** Arguments passed to a page module's HTTP action. */
export interface ActionArgs<
  ContextOrPath = unknown,
  PathOrContext = unknown,
> extends LoaderArgs<ContextOrPath, PathOrContext> {}

export type Loader<
  Data = unknown,
  Context = unknown,
  Path extends string = string,
> = (args: LoaderArgs<Context, Path>) => Data | Promise<Data>

export type RouteAction<
  Data = unknown,
  Context = unknown,
  Path extends string = string,
> = (args: ActionArgs<Context, Path>) => Data | Promise<Data>

export interface RouteModule<
  Data = unknown,
  Context = unknown,
  Path extends string = string,
> {
  readonly default: unknown
  readonly loader?: Loader<Data, Context, Path>
  readonly action?: RouteAction<unknown, Context, Path>
}

export type DocumentMode = "shell" | RenderMode
export type RequestPurpose = "data" | "document" | "action"

/** Inputs for constructing one request-scoped value for route work. */
export interface RequestContextArgs<
  Route extends RouteDefinition = RouteDefinition,
> {
  readonly request: Request
  readonly route: Route | null
  readonly params: Readonly<RouteParams<Route["path"]>>
  readonly purpose: RequestPurpose
  readonly mode?: DocumentMode
}

export type RequestContextFactory<
  Context = unknown,
  Route extends RouteDefinition = RouteDefinition,
> = (args: RequestContextArgs<Route>) => Context | Promise<Context>

/** Import a generated or application-provided route module by its entry ID. */
export type RouteImporter<
  Data = unknown,
  Context = unknown,
  Path extends string = string,
> = ((entry: string) => Promise<RouteModule<Data, Context, Path>>) & {
  /** Optional eager import hook used by generated server action registries. */
  readonly loadActions?: () => void | Promise<void>
}

export interface RenderedDocument {
  readonly html: string
  readonly routeData?: unknown
  readonly status?: number
  readonly headers?: HeadersInit
}

export type RenderDocumentResult = string | RenderedDocument

export interface LoadedRoute<
  Data = unknown,
  Context = unknown,
  Route extends RouteDefinition = RouteDefinition,
> {
  readonly route: Route
  readonly module: RouteModule<Data, Context>
  readonly loaderData: Data | undefined
}

/** A loaded route whose data follows the generated route-module map. */
export type LoadedRouteFor<
  Route extends RouteDefinition,
  Context = unknown,
> = Route extends RouteDefinition
  ? RouteLoaderFor<Route["path"]> extends (
      ...args: infer _Args
    ) => infer _Result
    ? Omit<
        LoadedRoute<RouteLoaderData<Route["path"]>, Context, Route>,
        "loaderData"
      > & {
        readonly loaderData: RouteLoaderData<Route["path"]>
      }
    : LoadedRoute<unknown, Context, Route>
  : never

/** Route-module shape selected from one authored route definition. */
export type RouteModuleForRoute<
  Route extends RouteDefinition,
  Context = unknown,
> = Route extends RouteDefinition
  ? RouteLoaderFor<Route["path"]> extends (
      ...args: infer _Args
    ) => infer _Result
    ? RouteModule<RouteLoaderData<Route["path"]>, Context, Route["path"]>
    : RouteModule<unknown, Context, Route["path"]>
  : never

/** Importer shape for applications that own a typed route-module boundary. */
export type RouteImporterFor<
  Route extends RouteDefinition,
  Context = unknown,
> = (entry: Route["entry"]) => Promise<RouteModuleForRoute<Route, Context>>

export interface RouteRuntimeContextOptions {
  readonly purpose: RequestPurpose
  readonly mode?: DocumentMode
}

export interface RouteLoadOptions<Context = unknown> {
  readonly context?: Context
  readonly mode?: DocumentMode
}

export interface RouteRuntime<
  Context = unknown,
  Route extends RouteDefinition = RouteDefinition,
> {
  readonly app: AppDefinition<Route>
  readonly importRoute: RouteImporter<unknown, Context>
  readonly match: (
    url: string | URL,
    options?: MatchRouteOptions,
  ) => RouteMatchForUrl<Route, string> | null
  readonly createRequestContext: (
    request: Request,
    options: RouteRuntimeContextOptions,
  ) => Promise<Context | undefined>
  readonly loadRoute: (
    request: Request,
    options?: RouteLoadOptions<Context>,
  ) => Promise<LoadedRouteFor<Route, Context> | null>
  readonly loadRouteData: (request: Request) => Promise<Response>
  readonly loadAction: (request: Request) => Promise<Response>
}

export interface RouteRuntimeOptions<
  Context = unknown,
  Route extends RouteDefinition = RouteDefinition,
> {
  readonly app: AppDefinition<Route>
  readonly importRoute: RouteImporter<unknown, Context>
  /** Eagerly load generated action modules before direct dispatch. */
  readonly loadActions?: () => void | Promise<void>
  /** Build request context for data requests and document router queries. */
  readonly requestContext?: RequestContextFactory<Context, Route>
}

async function loadMatchedRoute<
  Data = unknown,
  Context = unknown,
  Route extends RouteDefinition = RouteDefinition,
>(
  match: RouteMatchForUrl<Route, string>,
  request: Request,
  importRoute: RouteImporter<Data, Context>,
  context?: Context,
): Promise<LoadedRoute<Data, Context, Route>> {
  const routeModule = await importRoute(match.data.entry)
  const loaderData = routeModule.loader
    ? await routeModule.loader({
        request,
        params: match.params as LoaderArgs<Context, string>["params"],
        context: context as LoaderContext<Context, string>,
      })
    : undefined

  return {
    route: match.data,
    module: routeModule,
    loaderData,
  }
}

export function createRouteRuntime<
  Context = unknown,
  Route extends RouteDefinition = RouteDefinition,
>(
  options: Omit<RouteRuntimeOptions<Context, Route>, "importRoute"> & {
    readonly importRoute: RouteImporterFor<Route, Context>
  },
): RouteRuntime<Context, Route>

export function createRouteRuntime<
  Context = unknown,
  Route extends RouteDefinition = RouteDefinition,
>(options: RouteRuntimeOptions<Context, Route>): RouteRuntime<Context, Route> {
  const createRequestContext = async (
    request: Request,
    contextOptions: RouteRuntimeContextOptions,
    match = options.app.match(request.url),
  ): Promise<Context | undefined> => {
    if (!options.requestContext) {
      return undefined
    }

    return options.requestContext({
      request,
      route: match?.data ?? null,
      params: (match?.params ?? {}) as Readonly<RouteParams<Route["path"]>>,
      purpose: contextOptions.purpose,
      ...(contextOptions.mode === undefined
        ? {}
        : { mode: contextOptions.mode }),
    })
  }

  const loadRouteForRequest = async (
    request: Request,
    loadOptions: RouteLoadOptions<Context> = {},
  ): Promise<LoadedRouteFor<Route, Context> | null> => {
    const sanitizedRequest = stripFlamefrontProtocolRequest(request)
    const match = options.app.match(sanitizedRequest.url)

    if (!match) {
      return null
    }

    const context =
      "context" in loadOptions
        ? loadOptions.context
        : await createRequestContext(
            sanitizedRequest,
            { purpose: "data", mode: loadOptions.mode },
            match,
          )

    return loadMatchedRoute(
      match,
      sanitizedRequest,
      options.importRoute,
      context,
    ) as Promise<LoadedRouteFor<Route, Context>>
  }

  const loadRouteData = async (request: Request): Promise<Response> => {
    const routeUrl = new URL(request.url).searchParams.get("url")

    if (!routeUrl) {
      return new Response("Missing route URL.", { status: 400 })
    }

    const loaded = await loadRouteForRequest(
      stripFlamefrontProtocolRequest(
        new Request(routeUrl, {
          method: "GET",
          headers: request.headers,
          signal: request.signal,
        }),
      ),
    )

    if (!loaded) {
      return new Response("Not found.", { status: 404 })
    }

    return Response.json(loaded.loaderData ?? null)
  }

  const loadAction = async (request: Request): Promise<Response> => {
    const sanitizedRequest = stripFlamefrontProtocolRequest(request)
    const url = new URL(sanitizedRequest.url)

    if (["GET", "HEAD", "OPTIONS"].includes(sanitizedRequest.method)) {
      return new Response("Method not allowed.", { status: 405 })
    }

    if (!isSameOriginActionRequest(sanitizedRequest)) {
      return new Response("Forbidden.", { status: 403 })
    }

    const actionId = url.searchParams.get("action")

    if (actionId) {
      try {
        const args = await parseActionArguments(sanitizedRequest)

        if (!getRegisteredAction(actionId)) {
          await (options.loadActions ?? options.importRoute.loadActions)?.()
        }

        return await executeRegisteredAction(actionId, args)
      } catch (error) {
        return actionErrorResponse(error)
      }
    }

    const match = options.app.match(sanitizedRequest.url)

    if (!match) {
      return new Response("Not found.", { status: 404 })
    }

    if (match.data.render === "static") {
      return new Response(
        "Static routes cannot define actions; submit to a server route instead.",
        { status: 405 },
      )
    }

    const routeModule = await options.importRoute(match.data.entry)

    if (!routeModule.action) {
      return new Response("Method not allowed.", { status: 405 })
    }

    try {
      const context = await createRequestContext(
        sanitizedRequest,
        { purpose: "action", mode: match.data.render },
        match,
      )
      const value = await routeModule.action({
        request: sanitizedRequest,
        params: match.params as ActionArgs<Context, string>["params"],
        context: context as LoaderContext<Context, string>,
      })

      return actionResultResponse(value)
    } catch (error) {
      return actionErrorResponse(error)
    }
  }

  return {
    app: options.app,
    importRoute: options.importRoute,
    match: options.app.match,
    createRequestContext: (request, contextOptions) =>
      createRequestContext(request, contextOptions),
    loadRoute: loadRouteForRequest,
    loadRouteData,
    loadAction,
  }
}

export function loadRoute<
  _Data = unknown,
  Context = unknown,
  Route extends RouteDefinition = RouteDefinition,
>(
  app: AppDefinition<Route>,
  request: Request,
  importRoute: RouteImporterFor<Route, Context>,
  context?: Context,
): Promise<LoadedRouteFor<Route, Context> | null>

export function loadRoute<
  Data = unknown,
  Context = unknown,
  Route extends RouteDefinition = RouteDefinition,
>(
  app: AppDefinition<Route>,
  request: Request,
  importRoute: RouteImporter<Data, Context>,
  context?: Context,
): Promise<LoadedRoute<Data, Context, Route> | null>

export async function loadRoute<
  Data = unknown,
  Context = unknown,
  Route extends RouteDefinition = RouteDefinition,
>(
  app: AppDefinition<Route>,
  request: Request,
  importRoute: RouteImporter<Data, Context>,
  context?: Context,
): Promise<LoadedRouteFor<Route, Context> | null> {
  const sanitizedRequest = stripFlamefrontProtocolRequest(request)
  const match = app.match(sanitizedRequest.url)

  if (!match) {
    return null
  }

  return loadMatchedRoute(
    match,
    sanitizedRequest,
    importRoute,
    context,
  ) as Promise<LoadedRouteFor<Route, Context>>
}
