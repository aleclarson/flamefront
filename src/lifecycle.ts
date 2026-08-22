import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, relative, resolve, sep } from "node:path"
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

function isWithin(directory: string, filePath: string): boolean {
  const pathFromDirectory = relative(directory, filePath)

  return (
    pathFromDirectory === "" ||
    (pathFromDirectory !== ".." &&
      !pathFromDirectory.startsWith(`..${sep}`) &&
      !pathFromDirectory.startsWith(sep))
  )
}

function staticRouteFile(
  clientDirectory: string,
  route: RouteDefinition,
): string {
  if (/[:*]/.test(route.path)) {
    throw new Error(
      `Cannot prerender parameterized static route ${JSON.stringify(route.path)} without concrete paths.`,
    )
  }

  const segments = route.path
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))

  if (
    segments.some(
      (segment) => segment === "." || segment === ".." || segment.includes("/"),
    )
  ) {
    throw new Error(
      `Cannot write unsafe static route path ${JSON.stringify(route.path)}.`,
    )
  }

  const filePath = resolve(clientDirectory, ...segments, "index.html")

  if (!isWithin(clientDirectory, filePath)) {
    throw new Error(
      `Cannot write static route outside the client build: ${JSON.stringify(route.path)}.`,
    )
  }

  return filePath
}

export function staticRouteDataFile(
  clientDirectory: string,
  route: RouteDefinition,
): string {
  return staticRouteFile(clientDirectory, route).replace(
    /\.html$/,
    ".data.json",
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

function documentParts(document: RenderDocumentResult): {
  readonly html: string
  readonly status: number
  readonly hasRouteData: boolean
  readonly routeData: unknown
} {
  if (typeof document === "string") {
    return { html: document, status: 200, hasRouteData: false, routeData: null }
  }

  return {
    html: document.html,
    status: document.status ?? 200,
    hasRouteData: "routeData" in document,
    routeData: document.routeData,
  }
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

export async function buildProject(root = process.cwd()): Promise<void> {
  const { app } = await loadProject(root)
  const { build } = await import("vite")
  const dist = resolve(root, "dist")
  const clientDirectory = resolve(dist, "client")

  await rm(dist, { recursive: true, force: true })
  await build({
    root,
    configFile: resolve(root, "vite.config.ts"),
    build: {
      outDir: clientDirectory,
      manifest: true,
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

  await prerenderStaticRoutes(
    root,
    clientDirectory,
    staticRoutes,
    (request) =>
      serverEntry.renderDocument(clientTemplate, request, { mode: "static" }),
    async (request) => {
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
    },
    app.routing,
  )
}

export async function prerenderStaticRoutes(
  root: string,
  clientDirectory: string,
  routes: readonly RouteDefinition[],
  render: (request: Request) => Promise<RenderDocumentResult>,
  loadData?: (request: Request) => Promise<unknown>,
  routing: Pick<NormalizedRoutingOptions, "basename"> = { basename: "/" },
): Promise<void> {
  for (const route of routes) {
    const outputFile = staticRouteFile(clientDirectory, route)
    const outputDataFile = staticRouteDataFile(clientDirectory, route)
    const request = new Request(
      new URL(joinRoutePath(routing, route.path), "http://flamefront.build"),
    )
    const rendered = documentParts(await render(request))
    const data = rendered.hasRouteData
      ? rendered.routeData
      : loadData
        ? await loadData(request)
        : null

    await mkdir(dirname(outputFile), { recursive: true })
    await writeFile(outputFile, rendered.html)
    await writeFile(outputDataFile, JSON.stringify(data ?? null))
    console.log(`Generated ${relative(root, outputFile)}.`)
  }
}

export async function devProject(root = process.cwd()): Promise<void> {
  const { app } = await loadProject(root)
  const { createServer } = await import("vite")
  const port = Number(process.env.PORT ?? 5173)
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
