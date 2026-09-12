import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { access, readFile, rm, writeFile } from "node:fs/promises"
import { relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { serve } from "srvx"
import type { ServerMiddleware } from "srvx"
import type {
  AppDefinition,
  NormalizedRoutingOptions,
  RouteDefinition,
} from "./index.ts"
import { joinBasename } from "./index.ts"
import type { FlamefrontServerEntry } from "./srvx.ts"
import type { RenderDocumentResult } from "./server.ts"
import type {
  PrerenderCache,
  PrerenderOptions,
  PrerenderPage,
} from "./prerender.ts"
import {
  cacheKey as prerenderCacheKey,
  cacheNamespace,
  createFilesystemPrerenderCache,
  deserializePrerenderArtifact,
  hash,
  isParameterizedRoute,
  renderingFingerprint,
  routeSourceFile,
  serializePrerenderArtifact,
} from "./prerender.ts"
import { staticRouteFile } from "./static-fragment-artifacts.ts"
import type { RouteFragmentArtifact } from "./fragment-client.ts"
import {
  assembleStaticRouteArtifact,
  documentParts,
  renderStaticRoute,
  staticRouteRequest,
  writeStaticRouteArtifact,
} from "./prerender-artifacts.ts"
import { setGlobRoot } from "./glob.ts"
import { getFlamefrontOptions } from "./vite-options.ts"

export {
  staticRouteFile,
  staticRouteDataFile,
  staticRouteFragmentFile,
  staticRouteFragmentDataFile,
} from "./static-fragment-artifacts.ts"

export type {
  PrerenderCache,
  PrerenderOptions,
  PrerenderPage,
} from "./prerender.ts"

interface AppModule {
  app?: AppDefinition
  default?: AppDefinition
}

interface ServerModule {
  default?: unknown
}

export interface ProjectContext {
  readonly app: AppDefinition
  readonly root: string
  readonly routesFile: string
}

export interface BuildProjectOptions {
  readonly forcePrerender?: boolean
}

export interface PrerenderRouteEntry {
  readonly path: string
  readonly route: RouteDefinition
  readonly key: string | null
}

interface CollectedPrerenderRoute {
  readonly path: string
  readonly route: RouteDefinition
  readonly supplied?: PrerenderPage
}

export interface PrerenderStats {
  readonly rendered: number
  readonly reused: number
}

export interface PrerenderStaticRouteOptions {
  readonly cache?: PrerenderCache | false
  readonly force?: boolean
  readonly revision?: string
  readonly template?: string
  readonly fingerprint?: (
    route: RouteDefinition,
    path: string,
  ) => string | Promise<string>
}

export async function loadProject(
  root = process.cwd(),
): Promise<ProjectContext> {
  const routesFile = resolve(root, "src/app.ts")

  try {
    await access(routesFile)
  } catch {
    throw new Error(
      `Could not find ${routesFile}. Run ff from an app with src/app.ts.`,
    )
  }

  const url = pathToFileURL(routesFile)

  url.searchParams.set("ff", String(Date.now()))
  setGlobRoot(root)
  const module = (await import(url.href)) as AppModule
  const app = module.app ?? module.default

  if (!app || typeof app.shell !== "string" || !Array.isArray(app.routes)) {
    throw new Error(
      `${routesFile} must export an app with a shell and routes array.`,
    )
  }

  return { app, root, routesFile }
}

function loadDefaultServerEntry(module: ServerModule): FlamefrontServerEntry {
  const entry = module.default

  if (
    !entry ||
    typeof entry !== "object" ||
    typeof (entry as { fetch?: unknown }).fetch !== "function" ||
    typeof (entry as { renderDocument?: unknown }).renderDocument !==
      "function" ||
    typeof (entry as { loadRouteData?: unknown }).loadRouteData !== "function"
  ) {
    throw new Error(
      "src/entry-server.ts must default-export a Flamefront server entry with fetch, renderDocument, and loadRouteData.",
    )
  }

  return entry as FlamefrontServerEntry
}

function toRequest(request: IncomingMessage, url: URL): Request {
  const headers = new Headers()

  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item)
      }
    } else if (value !== undefined) {
      headers.set(name, value)
    }
  }

  return new Request(url, {
    method: request.method,
    headers,
  })
}

function send(
  response: ServerResponse,
  status: number,
  body: string | Uint8Array,
  contentType = "text/plain; charset=utf-8",
): void {
  response.statusCode = status
  response.setHeader("Content-Type", contentType)
  response.end(response.req.method === "HEAD" ? undefined : body)
}

async function sendFetchResponse(
  response: ServerResponse,
  fetchResponse: Response,
): Promise<void> {
  response.statusCode = fetchResponse.status
  for (const [name, value] of fetchResponse.headers) {
    response.setHeader(name, value)
  }

  response.end(
    response.req.method === "HEAD"
      ? undefined
      : Buffer.from(await fetchResponse.arrayBuffer()),
  )
}

async function loadBuiltServer(root: string): Promise<FlamefrontServerEntry> {
  const serverFile = resolve(root, "dist/server/server.js")

  try {
    await access(serverFile)
  } catch {
    throw new Error(`Could not find ${serverFile}. Run ff build first.`)
  }

  return loadDefaultServerEntry(
    (await import(pathToFileURL(serverFile).href)) as ServerModule,
  )
}

function requestUrl(request: IncomingMessage): URL {
  return new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  )
}

function concreteRoutePath(path: string): string {
  return (
    path
      .split("/")
      .map((segment) => {
        if (segment.startsWith("*")) {
          return "flamefront"
        }

        if (segment.startsWith(":")) {
          return "flamefront"
        }

        return segment
      })
      .join("/") || "/"
  )
}

function joinRoutePath(
  routing: Pick<NormalizedRoutingOptions, "basename">,
  path: string,
): string {
  return joinBasename(routing.basename, path)
}

async function listen(
  server: ReturnType<typeof createHttpServer>,
  port: number,
  label: string,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject)
    server.listen(port, () => {
      server.off("error", reject)
      console.log(`${label}: http://localhost:${port}`)
      resolvePromise()
    })
  })
}

async function loadBuildFlamefrontOptions(root: string) {
  const { loadConfigFromFile } = await import("vite")

  await loadConfigFromFile(
    { command: "build", mode: "production" },
    resolve(root, "vite.config.ts"),
    root,
  )

  return getFlamefrontOptions(root)
}

function validatePrerenderPath(path: unknown): asserts path is string {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new TypeError(
      `flamefront prerender page path must start with '/'; received ${JSON.stringify(path)}.`,
    )
  }

  if (path.includes("?") || path.includes("#")) {
    throw new TypeError(
      `flamefront prerender page path cannot contain a query or fragment: ${JSON.stringify(path)}.`,
    )
  }

  if (isParameterizedRoute(path)) {
    throw new TypeError(
      `flamefront prerender page path must be concrete: ${JSON.stringify(path)}.`,
    )
  }
}

function normalizedPrerenderPath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path
}

async function collectPrerenderRoutes(
  root: string,
  app: AppDefinition,
  options: PrerenderOptions,
): Promise<readonly CollectedPrerenderRoute[]> {
  const pages = new Map<string, RouteDefinition>()
  const suppliedPages = new Map<string, PrerenderPage>()
  const callbackPaths = new Set<string>()
  const staticRoutes = app.routes.filter((route) => route.render === "static")

  for (const route of staticRoutes) {
    if (!isParameterizedRoute(route.path)) {
      pages.set(route.path, route)
    }
  }

  if (options.pages) {
    const supplied = await options.pages({ root, routes: app.routes })

    for await (const page of supplied) {
      if (!page || typeof page !== "object") {
        throw new TypeError("flamefront prerender pages must contain objects.")
      }

      validatePrerenderPath(page.path)
      const path = normalizedPrerenderPath(page.path)
      const normalizedPage = path === page.path ? page : { ...page, path }

      if (callbackPaths.has(path)) {
        throw new TypeError(
          `flamefront prerender page path is duplicated: ${path}`,
        )
      }

      if (
        page.key !== undefined &&
        page.key !== null &&
        typeof page.key !== "string"
      ) {
        throw new TypeError(
          `flamefront prerender page key must be a string or null: ${path}`,
        )
      }

      const match = app.match(
        new URL(joinRoutePath(app.routing, path), "http://flamefront.build"),
        { render: "static" },
      )

      if (!match) {
        throw new Error(
          `flamefront prerender page ${JSON.stringify(path)} does not match a static route.`,
        )
      }

      callbackPaths.add(path)
      pages.set(path, match.data)
      suppliedPages.set(path, normalizedPage)
    }
  } else if (staticRoutes.some((route) => isParameterizedRoute(route.path))) {
    const route = staticRoutes.find((item) => isParameterizedRoute(item.path))!

    throw new Error(
      `Cannot prerender parameterized static route ${JSON.stringify(route.path)} without concrete paths.`,
    )
  }

  return [...pages].map(([path, route]) => ({
    path,
    route,
    supplied: suppliedPages.get(path),
  }))
}

async function resolvePrerenderKey(
  root: string,
  entry: Omit<PrerenderRouteEntry, "key">,
  supplied: PrerenderPage | undefined,
): Promise<string | null> {
  if (supplied?.key !== undefined) {
    return supplied.key
  }

  if (entry.route.content !== "markdown") {
    return null
  }

  const source = routeSourceFile(root, entry.route)

  try {
    return hash(await readFile(source))
  } catch (error) {
    throw new Error(
      `Cannot hash Markdown route source ${relative(root, source)}.`,
      { cause: error },
    )
  }
}

async function resolvePrerenderEntries(
  root: string,
  app: AppDefinition,
  options: PrerenderOptions,
): Promise<readonly PrerenderRouteEntry[]> {
  const routes = await collectPrerenderRoutes(root, app, options)

  return Promise.all(
    routes.map(async (entry) => ({
      ...entry,
      key: await resolvePrerenderKey(root, entry, entry.supplied),
    })),
  )
}

export async function prerenderStaticRouteEntries(
  root: string,
  clientDirectory: string,
  entries: readonly PrerenderRouteEntry[],
  render: (request: Request) => Promise<RenderDocumentResult>,
  loadData?: (request: Request) => Promise<unknown>,
  routing: Pick<NormalizedRoutingOptions, "basename"> = { basename: "/" },
  renderFragment?: (request: Request) => Promise<RouteFragmentArtifact>,
  options: PrerenderStaticRouteOptions = {},
): Promise<PrerenderStats> {
  const cache =
    options.cache === undefined
      ? createFilesystemPrerenderCache(root)
      : options.cache
  let rendered = 0
  let reused = 0

  for (const entry of entries) {
    const outputRoute =
      entry.route.path === entry.path
        ? entry.route
        : ({ ...entry.route, path: entry.path } satisfies RouteDefinition)
    const request = staticRouteRequest(routing, entry.path)
    const fingerprint = options.fingerprint
      ? await options.fingerprint(entry.route, entry.path)
      : hash({ route: entry.route, path: entry.path })
    const key =
      entry.key === null
        ? undefined
        : prerenderCacheKey(
            entry.path,
            entry.key,
            options.revision,
            fingerprint,
            cacheNamespace(root),
          )
    let artifact = null as Awaited<ReturnType<typeof renderStaticRoute>> | null
    let reusedEntry = false

    if (cache && key && !options.force) {
      try {
        const cached = await cache.get(key)
        const decoded = cached ? deserializePrerenderArtifact(cached) : null

        if (decoded?.path === entry.path) {
          artifact = options.template
            ? assembleStaticRouteArtifact(decoded.artifact, options.template)
            : decoded.artifact
          reusedEntry = artifact !== null

          if (artifact && options.template !== undefined && cache) {
            try {
              await cache.put(
                key,
                serializePrerenderArtifact(entry.path, artifact),
              )
            } catch (error) {
              console.warn(
                `Flamefront prerender cache write failed for ${entry.path}; continuing with the build.`,
                error,
              )
            }
          }
        }
      } catch (error) {
        console.warn(
          `Flamefront prerender cache read failed for ${entry.path}; rendering it again.`,
          error,
        )
      }
    }

    if (!artifact) {
      artifact = await renderStaticRoute(
        outputRoute,
        request,
        render,
        loadData,
        renderFragment,
        options.template,
      )
      rendered += 1

      if (cache && key) {
        try {
          await cache.put(key, serializePrerenderArtifact(entry.path, artifact))
        } catch (error) {
          console.warn(
            `Flamefront prerender cache write failed for ${entry.path}; continuing with the build.`,
            error,
          )
        }
      }
    } else if (reusedEntry) {
      reused += 1
    }

    await writeStaticRouteArtifact(clientDirectory, outputRoute, artifact)
    console.log(
      `${reusedEntry ? "Reused" : "Generated"} ${relative(root, staticRouteFile(clientDirectory, outputRoute))}.`,
    )
  }

  return { rendered, reused }
}

export async function buildProject(
  root = process.cwd(),
  buildOptions: BuildProjectOptions = {},
): Promise<void> {
  const { app } = await loadProject(root)
  const flamefrontOptions = await loadBuildFlamefrontOptions(root)
  const { build } = await import("vite")
  const dist = resolve(root, "dist")
  const clientDirectory = resolve(dist, "client")

  await rm(dist, { recursive: true, force: true })
  await build({
    root,
    configFile: resolve(root, "vite.config.ts"),
    build: {
      outDir: clientDirectory,
    },
  })
  await build({
    root,
    configFile: resolve(root, "vite.config.ts"),
    ssr: { noExternal: ["srvx"] },
    build: {
      ssr: resolve(root, "src/entry-server.ts"),
      outDir: resolve(dist, "server"),
      rollupOptions: {
        output: { entryFileNames: "server.js" },
      },
    },
  })

  const clientTemplateFile = resolve(clientDirectory, "index.html")
  const clientTemplate = await readFile(clientTemplateFile, "utf8")
  const serverTemplateFile = resolve(dist, "server/index.html")

  const serverEntry = await loadBuiltServer(root)

  await writeFile(serverTemplateFile, clientTemplate)

  const clientRoute = app.routes.find((route) => route.render === "client")

  if (clientRoute) {
    const shellPath = joinRoutePath(
      app.routing,
      concreteRoutePath(clientRoute.path),
    )
    const shellRequest = new Request(
      new URL(`${shellPath}?__flamefront_shell=1`, "http://flamefront.build"),
    )
    const shell = documentParts(
      await serverEntry.renderDocument(clientTemplate, shellRequest, {
        mode: "shell",
      }),
    )

    await writeFile(clientTemplateFile, shell.html)
  }

  const staticRoutes = app.routes.filter((route) => route.render === "static")

  if (staticRoutes.length === 0) {
    return
  }

  const render = (request: Request) =>
    serverEntry.renderDocument(clientTemplate, request, { mode: "static" })
  const loadData = async (request: Request) => {
    const endpoint = new URL(app.routing.dataPath, request.url)

    endpoint.searchParams.set("url", request.url)
    const response = await serverEntry.loadRouteData(
      new Request(endpoint, {
        headers: request.headers,
        signal: request.signal,
      }),
    )

    if (!response.ok) {
      throw response
    }

    return response.json()
  }

  const renderFragment = serverEntry.renderFragment
    ? (request: Request) => serverEntry.renderFragment!(request)
    : undefined

  if (!flamefrontOptions?.prerender) {
    await prerenderStaticRoutes(
      root,
      clientDirectory,
      staticRoutes,
      render,
      loadData,
      app.routing,
      renderFragment,
    )
    return
  }

  const entries = await resolvePrerenderEntries(
    root,
    app,
    flamefrontOptions.prerender,
  )
  const stats = await prerenderStaticRouteEntries(
    root,
    clientDirectory,
    entries,
    render,
    loadData,
    app.routing,
    renderFragment,
    {
      cache: flamefrontOptions.prerender.cache,
      force: buildOptions.forcePrerender,
      revision: flamefrontOptions.prerender.revision,
      template: clientTemplate,
      fingerprint: (route, path) =>
        renderingFingerprint(root, app, route, path, {
          markdown: flamefrontOptions.markdown,
          target: flamefrontOptions.target,
          template: clientTemplate,
        }),
    },
  )

  console.log(
    `Prerendered ${stats.rendered} pages, reused ${stats.reused} cached pages.`,
  )
}

export async function prerenderStaticRoutes(
  root: string,
  clientDirectory: string,
  routes: readonly RouteDefinition[],
  render: (request: Request) => Promise<RenderDocumentResult>,
  loadData?: (request: Request) => Promise<unknown>,
  routing: Pick<NormalizedRoutingOptions, "basename"> = { basename: "/" },
  renderFragment?: (request: Request) => Promise<RouteFragmentArtifact>,
): Promise<void> {
  for (const route of routes) {
    const request = staticRouteRequest(routing, route.path)
    const artifact = await renderStaticRoute(
      route,
      request,
      render,
      loadData,
      renderFragment,
    )

    await writeStaticRouteArtifact(clientDirectory, route, artifact)
    console.log(
      `Generated ${relative(root, staticRouteFile(clientDirectory, route))}.`,
    )
  }
}

export async function devProject(
  root = process.cwd(),
  port = Number(process.env.PORT ?? 5173),
): Promise<void> {
  const { app } = await loadProject(root)
  const { createServer } = await import("vite")
  const vite = await createServer({
    root,
    appType: "spa",
    server: { middlewareMode: true },
  })
  const server = createHttpServer(async (request, response) => {
    const url = requestUrl(request)
    const match = app.match(url)

    try {
      if (
        url.pathname === app.routing.dataPath ||
        match ||
        url.pathname === app.routing.basename
      ) {
        const entry = loadDefaultServerEntry(
          (await vite.ssrLoadModule("/src/entry-server.ts")) as ServerModule,
        )
        const entryServer = serve({
          ...entry,
          manual: true,
          silent: true,
        })

        try {
          await sendFetchResponse(
            response,
            await entryServer.fetch(toRequest(request, url)),
          )
        } finally {
          await entryServer.close()
        }

        return
      }
    } catch (error) {
      if (error instanceof Response) {
        await sendFetchResponse(response, error)
        return
      }

      vite.ssrFixStacktrace(error as Error)
      console.error(error)
      send(
        response,
        500,
        `<pre>${String((error as Error).stack ?? error)}</pre>`,
        "text/html; charset=utf-8",
      )
      return
    }

    vite.middlewares(request, response, (error?: Error) => {
      if (error) {
        vite.ssrFixStacktrace(error)
        console.error(error)
        if (!response.headersSent) {
          send(
            response,
            500,
            `<pre>${String(error.stack ?? error)}</pre>`,
            "text/html; charset=utf-8",
          )
        }

        return
      }

      if (!response.headersSent) {
        send(response, 404, "Not found")
      }
    })
  })

  await listen(server, port, "Flamefront dev server")
  const close = async () => {
    server.close()
    await vite.close()
  }

  process.once("SIGINT", close)
  process.once("SIGTERM", close)
}

export async function previewProject(root = process.cwd()): Promise<void> {
  const port = Number(process.env.PORT ?? 4173)
  const checkToken = process.env.FLAMEFRONT_CHECK_TOKEN
  const serverEntry = await loadBuiltServer(root)
  const checkMiddleware = checkToken
    ? async (_request: Request, next: () => Response | Promise<Response>) => {
        const response = await next()

        try {
          response.headers.set("X-Flamefront-Check-Token", checkToken)
          return response
        } catch {
          const headers = new Headers(response.headers)

          headers.set("X-Flamefront-Check-Token", checkToken)
          return new Response(response.body, {
            headers,
            status: response.status,
            statusText: response.statusText,
          })
        }
      }
    : undefined
  const server = serve({
    ...serverEntry,
    port,
    gracefulShutdown: true,
    middleware: [checkMiddleware, ...(serverEntry.middleware ?? [])].filter(
      Boolean,
    ) as ServerMiddleware[],
  })

  await server.ready()
}
