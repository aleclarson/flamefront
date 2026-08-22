export interface RemixStaticContext {
  readonly loaderData: Record<string, unknown>
  readonly actionData: Record<string, unknown> | null
  readonly errors: Record<string, unknown> | null
  readonly statusCode?: number
}

export interface RemixRouterRuntime<
  Route = unknown,
  ClientRouter = unknown,
  ServerRouter = unknown,
  Context extends RemixStaticContext = RemixStaticContext,
  ClientOptions = unknown,
> {
  createBrowserRouter(routes: Route[], options?: ClientOptions): ClientRouter
  createStaticHandler(
    routes: Route[],
    options?: { basename?: string },
  ): {
    readonly dataRoutes: Route[]
    query(
      request: Request,
      options?: { requestContext?: unknown },
    ): Promise<Response | Context>
  }
  createStaticRouter(routes: Route[], context: Context): ServerRouter
}

export interface ServerRouterResult<
  Router = unknown,
  Context = RemixStaticContext,
> {
  readonly context: Context
  readonly hydrationData: {
    readonly loaderData: Record<string, unknown>
    readonly actionData: Record<string, unknown> | null
    readonly errors: Record<string, unknown> | null
  }
  readonly router: Router
}

export interface ServerRouterOptions {
  readonly basename?: string
  readonly requestContext?: unknown
}

export interface RemixRouterAdapterOptions {
  readonly basename?: string
}

export function createRemixRouterAdapter<
  Route,
  ClientRouter,
  ServerRouter,
  Context extends RemixStaticContext,
  ClientOptions,
>(
  routeGraph: Route[],
  runtime: RemixRouterRuntime<
    Route,
    ClientRouter,
    ServerRouter,
    Context,
    ClientOptions
  >,
  defaults: RemixRouterAdapterOptions = {},
) {
  return {
    routes: routeGraph,
    createClientRouter(options?: ClientOptions) {
      if (defaults.basename === undefined) {
        return runtime.createBrowserRouter(routeGraph, options)
      }

      return runtime.createBrowserRouter(routeGraph, {
        ...(options && typeof options === "object" ? options : {}),
        basename: defaults.basename,
      } as ClientOptions)
    },
    async createServerRouter(
      request: Request,
      options: ServerRouterOptions = {},
    ): Promise<Response | ServerRouterResult<ServerRouter, Context>> {
      const handler = runtime.createStaticHandler(routeGraph, {
        basename: options.basename ?? defaults.basename,
      })
      const context = await handler.query(request, {
        requestContext: options.requestContext,
      })

      if (context instanceof Response) {
        return context
      }

      return {
        context,
        hydrationData: {
          loaderData: context.loaderData,
          actionData: context.actionData,
          errors: context.errors,
        },
        router: runtime.createStaticRouter(handler.dataRoutes, context),
      }
    },
  }
}
