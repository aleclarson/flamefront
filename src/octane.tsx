import type {
  AppDefinition,
  GeneratedRouteMetadata,
  RouteDefinition,
  RouteParams,
} from "./index.ts"
import type {
  DocumentMode,
  RouteRuntime,
  RenderedDocument,
  RouteRuntimeContextOptions,
} from "./server.ts"
import type {
  ServerRouterOptions,
  ServerRouterResult,
} from "./remix-router-core.ts"
import { stripFlamefrontProtocolRequest } from "./fragment-protocol.ts"
import {
  routeFragmentProtocol,
  type RouteFragmentArtifact,
  type RouteFragmentBoundary,
} from "./fragment-client.ts"
import {
  outletIdentifierPrefix,
  shellIdentifierPrefix,
} from "./identifier-prefix.ts"

export type { DocumentMode, RenderedDocument } from "./server.ts"

export interface RouterDocumentProps {
  readonly router: unknown
  readonly context: unknown
  /** Server-only markup for the independently-owned routed outlet. */
  readonly outletHtml?: string | null
}

export type RouterDocument = (props: RouterDocumentProps) => unknown

/** Framework-rendered document pieces available to the app composer. */
export interface DocumentParts {
  readonly template: string
  readonly body: string
  readonly css: string
  readonly hydrationScript: string
}

export interface DocumentCompositionContext<
  Route extends RouteDefinition = RouteDefinition,
> {
  readonly request: Request
  readonly mode: DocumentMode
  readonly route: Route | null
  readonly params: Readonly<RouteParams<Route["path"]>>
  readonly status: number
}

export type ComposeDocument<Route extends RouteDefinition = RouteDefinition> = (
  parts: DocumentParts,
  context: DocumentCompositionContext<Route>,
) => string | Promise<string>

export interface RenderDocumentOptions {
  readonly mode?: DocumentMode
}

export interface OctaneRenderResult {
  readonly html: string
  readonly css: string
}

/**
 * The renderer is injectable so document behavior can be tested without
 * loading the compiler-only Octane and Remix Router source modules in Node.
 */
export interface OctaneRenderer {
  readonly createStaticRouter: (
    routes: readonly unknown[],
    context: unknown,
  ) => unknown
  readonly renderToString: (
    component: RouterDocument,
    props: RouterDocumentProps,
    options?: { readonly identifierPrefix?: string },
  ) => OctaneRenderResult
  /** Render one generated route boundary directly from the static router tree. */
  readonly renderRouteFragment?: (
    router: unknown,
    context: unknown,
    boundary: string,
    options?: {
      readonly identifierPrefix?: string
      readonly includeBoundary?: boolean
    },
  ) => OctaneRenderResult
  readonly defaultRouterDocument: RouterDocument
}

export interface DocumentRouter {
  readonly routes: readonly unknown[]
  readonly routeMetadata?: readonly GeneratedRouteMetadata[]
  readonly createServerRouter: (
    request: Request,
    options?: ServerRouterOptions,
  ) => Promise<Response | ServerRouterResult<unknown, unknown>>
}

export interface OctaneDocumentsOptions<
  Context = unknown,
  Route extends RouteDefinition = RouteDefinition,
> {
  readonly app: AppDefinition<Route>
  readonly runtime: RouteRuntime<Context, Route>
  /** Wrap the framework's default RouterProvider with app providers. */
  readonly routerDocument?: RouterDocument
  /** Control HTML placement while retaining framework protocol pieces. */
  readonly composeDocument?: ComposeDocument<Route>
  readonly router?: DocumentRouter
  readonly renderer?: OctaneRenderer
}

export interface OctaneDocuments {
  readonly renderDocument: (
    template: string,
    request: Request,
    options?: RenderDocumentOptions,
  ) => Promise<RenderedDocument>
  readonly loadRouteData: (request: Request) => Promise<Response>
  readonly loadAction: (request: Request) => Promise<Response>
  readonly renderFragment: (request: Request) => Promise<RouteFragmentArtifact>
}

interface StaticDocumentContext {
  readonly loaderData?: Record<string, unknown>
  readonly actionData?: Record<string, unknown> | null
  readonly errors?: Record<string, unknown> | null
  readonly statusCode?: number
  readonly matches?: readonly {
    readonly params?: Readonly<Record<string, string | undefined>>
    readonly pathname?: string
    readonly pathnameBase?: string
    readonly route?: { readonly id?: string }
  }[]
  readonly actionHeaders?: Record<string, Headers>
}

function isRouteErrorResponse(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { status?: unknown }).status === "number" &&
    typeof (value as { statusText?: unknown }).statusText === "string" &&
    typeof (value as { internal?: unknown }).internal === "boolean" &&
    "data" in value,
  )
}

export function serializeErrors(
  errors: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!errors) {
    return null
  }

  const serialized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(errors)) {
    if (isRouteErrorResponse(value)) {
      serialized[key] = { ...value, __type: "RouteErrorResponse" }
    } else if (value instanceof Error) {
      serialized[key] = {
        message: value.message,
        __type: "Error",
        ...(value.name !== "Error" ? { __subType: value.name } : {}),
      }
    } else {
      serialized[key] = value
    }
  }

  return serialized
}

export const staticRouterHydrationScriptId =
  "flamefront-static-router-hydration"

export function staticRouterHydrationScript(
  context: StaticDocumentContext,
): string {
  const data = JSON.stringify({
    loaderData: context.loaderData,
    actionData: context.actionData,
    errors: serializeErrors(context.errors),
  })
  const escaped = JSON.stringify(data).replace(
    /[&><\u2028\u2029]/g,
    (character) => {
      const escapes: Record<string, string> = {
        "&": "\\u0026",
        ">": "\\u003e",
        "<": "\\u003c",
        " ": "\\u2028",
        " ": "\\u2029",
      }

      return escapes[character] ?? character
    },
  )

  return `<script id="${staticRouterHydrationScriptId}">window.__staticRouterHydrationData = JSON.parse(${escaped});</script>`
}

export function composeDefaultDocument(
  template: string,
  body: string,
  css: string,
  hydrationScript: string,
): string {
  const root = '<div id="root"></div>'

  if (!template.includes(root)) {
    throw new Error(
      'The HTML shell must contain an empty <div id="root"></div>.',
    )
  }

  return template
    .replace(root, `<div id="root">${body}</div>`)
    .replace("</head>", `${css}</head>`)
    .replace("</body>", `${hydrationScript}</body>`)
}

async function loadDefaultRouter(): Promise<DocumentRouter> {
  const module = await import("./remix-router.ts")

  return {
    routes: module.routes,
    routeMetadata: module.routeMetadata,
    createServerRouter: module.createServerRouter,
  }
}

async function loadDefaultRenderer(): Promise<OctaneRenderer> {
  return (await import("./octane-default-renderer.tsx")).defaultOctaneRenderer
}

function createShellRouter<Route extends RouteDefinition>(
  request: Request,
  app: AppDefinition<Route>,
  routeGraph: readonly unknown[],
  renderer: OctaneRenderer,
): { readonly context: StaticDocumentContext; readonly router: unknown } {
  const url = new URL(request.url)
  const rootRoute =
    routeGraph[0] && typeof routeGraph[0] === "object" ? routeGraph[0] : {}
  const context: StaticDocumentContext & {
    readonly basename: string
    readonly location: Record<string, unknown>
  } = {
    basename: app.routing.basename,
    location: {
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      state: null,
      key: "default",
    },
    matches: [
      {
        params: {},
        pathname: "",
        pathnameBase: app.routing.basename,
        route: { ...rootRoute, id: "0" },
      },
    ],
    loaderData: {},
    actionData: null,
    errors: null,
    statusCode: 200,
  }

  return {
    context,
    router: renderer.createStaticRouter(routeGraph, context),
  }
}

function resolveDocumentMode(
  request: Request,
  mode: DocumentMode | undefined,
  route: RouteDefinition | null,
): DocumentMode {
  if (mode) {
    return mode
  }

  if (new URL(request.url).searchParams.has("__flamefront_shell")) {
    return "shell"
  }

  if (!route) {
    throw new Response("Not found", { status: 404 })
  }

  return route.render
}

function assertRouteMode(
  route: RouteDefinition | null,
  mode: DocumentMode,
): void {
  if (mode === "shell") {
    return
  }

  if (!route || route.render !== mode) {
    throw new Response("Not found", { status: 404 })
  }
}

function routeData(context: StaticDocumentContext): unknown {
  const leaf = context.matches?.at(-1)
  const routeId = leaf?.route?.id

  return routeId ? (context.loaderData?.[routeId] ?? null) : null
}

function actionResponseHeaders(
  context: StaticDocumentContext,
): Headers | undefined {
  if (!context.actionHeaders) {
    return undefined
  }

  const headers = new Headers()
  let hasHeaders = false

  for (const value of Object.values(context.actionHeaders)) {
    for (const [name, header] of value) {
      headers.append(name, header)
      hasHeaders = true
    }
  }

  return hasHeaders ? headers : undefined
}

function remapShellRouteError(
  route: RouteDefinition | null,
  context: StaticDocumentContext,
  metadata: readonly GeneratedRouteMetadata[] | undefined,
): StaticDocumentContext {
  if (!route || !context.errors) {
    return context
  }

  const chain = fragmentMetadataChain(route, metadata)
  const shell = chain.find((item) => item.kind === "shell")
  const outlet = shell ? chain[chain.indexOf(shell) + 1] : undefined

  if (!shell || !outlet || !context.errors[shell.id]) {
    return context
  }

  const errors = { ...context.errors }
  const shellError = errors[shell.id]

  delete errors[shell.id]
  if (errors[outlet.id] === undefined) {
    errors[outlet.id] = shellError
  }

  return {
    ...context,
    errors,
  }
}

function routerRoutes(value: unknown): readonly unknown[] | undefined {
  if (!value || typeof value !== "object") {
    return undefined
  }

  const routes = (value as { readonly routes?: unknown }).routes

  return Array.isArray(routes) ? routes : undefined
}

function fragmentMetadataChain(
  route: RouteDefinition,
  metadata: readonly GeneratedRouteMetadata[] | undefined,
): GeneratedRouteMetadata[] {
  const leaf = metadata?.find(
    (item) =>
      item.kind === "route" &&
      item.entry === route.entry &&
      (item.path === route.path || item.path === undefined),
  )

  if (!leaf) {
    return [
      {
        id: route.entry,
        boundary: route.entry,
        kind: "route",
        entry: route.entry,
        path: route.path,
        render: route.render,
        navigation: "fragment",
        hydration: route.hydration,
      },
    ]
  }

  const byId = new Map((metadata ?? []).map((item) => [item.id, item]))
  const chain: GeneratedRouteMetadata[] = []
  let current: GeneratedRouteMetadata | undefined = leaf

  while (current) {
    chain.unshift(current)
    current = current.parent ? byId.get(current.parent) : undefined
  }

  return chain
}

function createRouteFragmentArtifact(
  route: RouteDefinition,
  context: StaticDocumentContext,
  router: unknown,
  renderer: OctaneRenderer,
  fallbackBody: string,
  metadata: readonly GeneratedRouteMetadata[] | undefined,
): RouteFragmentArtifact {
  const chain = fragmentMetadataChain(route, metadata)
  const boundaries: RouteFragmentBoundary[] = chain.map((item) => {
    const rendered = renderer.renderRouteFragment?.(
      router,
      context,
      item.boundary,
      { identifierPrefix: outletIdentifierPrefix },
    )

    return {
      id: item.id,
      boundary: item.boundary,
      kind: item.kind,
      ...(item.parent ? { parent: item.parent } : {}),
      html: rendered?.html ?? (item === chain.at(-1) ? fallbackBody : ""),
    }
  })
  const fragmentHtml = boundaries.at(-1)?.html || fallbackBody

  return {
    protocol: routeFragmentProtocol,
    route: route.path,
    boundary: chain.at(-1)?.boundary ?? route.entry,
    html: fragmentHtml,
    routeData: routeData(context),
    boundaries,
    hydration: route.hydration,
    status: context.statusCode ?? 200,
  }
}

function appendCss(documentCss: string, outletCss: string | undefined): string {
  if (!outletCss || outletCss === documentCss) {
    return documentCss
  }

  const tags = new Set(
    `${documentCss}${outletCss}`.match(/<style\b[^>]*>[\s\S]*?<\/style>/g) ??
      [],
  )

  return tags.size === 0 ? `${documentCss}${outletCss}` : [...tags].join("")
}

function renderDocumentOutlet(
  route: RouteDefinition | null,
  context: StaticDocumentContext,
  router: unknown,
  renderer: OctaneRenderer,
  metadata: readonly GeneratedRouteMetadata[] | undefined,
): { readonly html: string; readonly css: string } | undefined {
  if (
    !route ||
    (route.render !== "server" && route.render !== "static") ||
    !renderer.renderRouteFragment
  ) {
    return undefined
  }

  const chain = fragmentMetadataChain(route, metadata)
  const shellIndex = chain.findIndex((item) => item.kind === "shell")
  const outlet = shellIndex < 0 ? undefined : chain[shellIndex + 1]

  if (!outlet) {
    return undefined
  }

  return renderer.renderRouteFragment(router, context, outlet.boundary, {
    identifierPrefix: outletIdentifierPrefix,
    includeBoundary: true,
  })
}

export function createOctaneDocuments<
  Context = unknown,
  Route extends RouteDefinition = RouteDefinition,
>(options: OctaneDocumentsOptions<Context, Route>): OctaneDocuments {
  let routerPromise: Promise<DocumentRouter> | undefined
  let rendererPromise: Promise<OctaneRenderer> | undefined

  const getRouter = (): Promise<DocumentRouter> => {
    if (options.router) {
      return Promise.resolve(options.router)
    }

    return (routerPromise ??= loadDefaultRouter())
  }

  const getRenderer = (): Promise<OctaneRenderer> => {
    if (options.renderer) {
      return Promise.resolve(options.renderer)
    }

    return (rendererPromise ??= loadDefaultRenderer())
  }

  const renderRoute = async (
    request: Request,
    mode: DocumentMode,
    route: RouteDefinition | null,
    renderOutlet = false,
  ): Promise<{
    readonly router: DocumentRouter
    readonly dataRouter: unknown
    readonly renderer: OctaneRenderer
    readonly context: StaticDocumentContext
    readonly rendered: OctaneRenderResult
  }> => {
    const contextOptions: RouteRuntimeContextOptions = {
      purpose: ["GET", "HEAD"].includes(request.method) ? "document" : "action",
      mode,
    }
    const requestContext = await options.runtime.createRequestContext(
      request,
      contextOptions,
    )
    const [router, renderer] = await Promise.all([getRouter(), getRenderer()])
    const routerDocument =
      options.routerDocument ?? renderer.defaultRouterDocument
    const result =
      mode === "shell" || mode === "client"
        ? createShellRouter(request, options.app, router.routes, renderer)
        : await router.createServerRouter(request, {
            basename: options.app.routing.basename,
            requestContext,
          })

    if (result instanceof Response) {
      throw result
    }

    const context = remapShellRouteError(
      route,
      result.context as StaticDocumentContext,
      router.routeMetadata,
    )
    const dataRouter =
      context === result.context
        ? result.router
        : renderer.createStaticRouter(
            routerRoutes(result.router) ?? router.routes,
            context,
          )
    const outlet = renderDocumentOutlet(
      renderOutlet ? route : null,
      context,
      dataRouter,
      renderer,
      router.routeMetadata,
    )
    const documentProps: RouterDocumentProps = {
      router: dataRouter,
      context,
      ...(outlet ? { outletHtml: outlet.html } : {}),
    }
    const rendered = renderer.renderToString(routerDocument, documentProps, {
      identifierPrefix: shellIdentifierPrefix,
    })

    return {
      router,
      dataRouter,
      renderer,
      context,
      rendered: {
        ...rendered,
        css: appendCss(rendered.css, outlet?.css),
      },
    }
  }

  const renderDocument = async (
    template: string,
    request: Request,
    renderOptions: RenderDocumentOptions = {},
  ): Promise<RenderedDocument> => {
    const sanitizedRequest = stripFlamefrontProtocolRequest(request)
    const routeMatch = options.app.match(sanitizedRequest.url)
    const route = routeMatch?.data ?? null
    const mode = resolveDocumentMode(request, renderOptions.mode, route)

    assertRouteMode(route, mode)
    const { context: staticContext, rendered } = await renderRoute(
      sanitizedRequest,
      mode,
      route,
      true,
    )
    const status = staticContext.statusCode ?? 200
    const compositionContext: DocumentCompositionContext<Route> = {
      request: sanitizedRequest,
      mode,
      route,
      params: (routeMatch?.params ?? {}) as Readonly<
        RouteParams<Route["path"]>
      >,
      status,
    }
    const parts: DocumentParts = {
      template,
      body: rendered.html,
      css: rendered.css,
      hydrationScript: staticRouterHydrationScript(staticContext),
    }
    const html = await (options.composeDocument
      ? options.composeDocument(parts, compositionContext)
      : composeDefaultDocument(
          parts.template,
          parts.body,
          parts.css,
          parts.hydrationScript,
        ))

    const headers = actionResponseHeaders(staticContext)

    return mode === "static"
      ? {
          html,
          routeData: routeData(staticContext),
          status,
          ...(headers ? { headers } : {}),
        }
      : { html, status, ...(headers ? { headers } : {}) }
  }

  const renderFragment = async (
    request: Request,
  ): Promise<RouteFragmentArtifact> => {
    const sanitizedRequest = stripFlamefrontProtocolRequest(request)
    const routeMatch = options.app.match(sanitizedRequest.url)
    const route = routeMatch?.data ?? null

    if (!route || route.render === "client") {
      throw new Response("Not found", { status: 404 })
    }

    const { router, dataRouter, renderer, rendered, context } =
      await renderRoute(sanitizedRequest, route.render, route)

    return createRouteFragmentArtifact(
      route,
      context,
      dataRouter,
      renderer,
      rendered.html,
      router.routeMetadata,
    )
  }

  return {
    renderDocument,
    loadRouteData: options.runtime.loadRouteData,
    loadAction: options.runtime.loadAction,
    renderFragment,
  }
}
