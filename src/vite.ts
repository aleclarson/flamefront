import fs from "node:fs"
import type { ViteDevServer } from "vite"
import {
  readProjectTemplate,
  devTemplateLoadersKey,
} from "./document-template.ts"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { compile as compileOctane } from "octane/compiler"
import type { Features, HastPluginList, MdastPluginList } from "satteri"
import vitePluginSatteri, { type MdxOptions } from "vite-plugin-satteri"
import type {
  AppDefinition,
  GeneratedHydration,
  GeneratedRouteMetadata,
  NormalizedRoutingOptions,
  RouteConfig,
  RouteDefinition,
} from "./index.ts"
import { generate, parse, traverse, type Babel } from "./babel.ts"
import { expandGlob, globDirectory, setGlobRoot } from "./glob.ts"
import { removeExports } from "./remove-exports.ts"
import {
  findActionExports,
  generateActionProxyModule,
  transformServerActions,
} from "./action-transform.ts"
import { writeRouteImportMap } from "./typegen.ts"
import {
  resolveFlamefrontOutput,
  type FlamefrontOutputOptions,
  type ResolvedFlamefrontOutput,
} from "./output.ts"
import type { PrerenderOptions } from "./prerender.ts"
import {
  registerFlamefrontOptions,
  registerFlamefrontRoot,
} from "./vite-options.ts"

export type {
  FlamefrontAdapter,
  FlamefrontOutputOptions,
  FlamefrontTarget,
  ResolvedFlamefrontOutput,
} from "./output.ts"

export const remixRoutesId = "virtual:flamefront/remix-routes"
const resolvedRemixRoutesId = `\0${remixRoutesId}`

export const serverRoutesId = "virtual:flamefront/server-routes"
const resolvedServerRoutesId = `\0${serverRoutesId}`

export const serverEntryId = "virtual:flamefront/server-entry"
const resolvedServerEntryId = `\0${serverEntryId}`
const actionProxyId = "\0flamefront/action-proxy"
const actionProxyPrefix = `${actionProxyId}?module=`
const hydrationRouteId = "/@flamefront/hydration-route.tsrx"
const resolvedHydrationRoutePrefix = `${hydrationRouteId}?`
const markdownRouteId = "/@flamefront/markdown-route.tsrx"
const resolvedMarkdownRoutePrefix = `${markdownRouteId}?`
const SERVER_ONLY_ROUTE_EXPORTS = ["loader", "action"] as const
const serverFilePattern = /\.server(?:\.[cm]?[jt]sx?|\.tsrx)$/
const serverDirectoryPattern = /\/\.server\//

export interface FlamefrontOptions extends FlamefrontOutputOptions {
  /** Project-root route manifest module. */
  readonly routes?: string
  /** Built-in Markdown and MDX compiler configuration. */
  readonly markdown?: false | MarkdownOptions
  /** Configure incremental static rendering and its persistent cache. */
  readonly prerender?: PrerenderOptions
}

export interface MarkdownOptions {
  /** Parser feature toggles. GFM and frontmatter are enabled by default. */
  readonly features?: Features
  /** MDAST plugins shared by Markdown and MDX entries. */
  readonly mdastPlugins?: MdastPluginList
  /** HAST plugins shared by Markdown and MDX entries. */
  readonly hastPlugins?: HastPluginList
  /** MDX compiler options; its JSX import source is always `octane`. */
  readonly mdx?:
    boolean | Omit<MdxOptions, "jsxImportSource" | "jsx" | "jsxRuntime">
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function lazyLayout(entry: string, metadata: GeneratedRouteMetadata): string {
  return `async () => { const routeModule = await import(${quote(entry)}); return { Component: createRouteBoundary(routeModule.default, ${JSON.stringify(metadata)}) }; }`
}

function generatesHydrationBoundary(
  routeDefinition: RouteDefinition,
): routeDefinition is RouteDefinition & {
  hydration: GeneratedHydration | "none"
} {
  return (
    (routeDefinition.render === "server" ||
      routeDefinition.render === "static") &&
    (routeDefinition.hydration === "none" ||
      typeof routeDefinition.hydration === "object")
  )
}

function hydrationComponentId(
  entry: string,
  hydration: GeneratedHydration | "none",
): string {
  const parameters = new URLSearchParams({
    entry,
    hydration: JSON.stringify(hydration),
  })

  return `${hydrationRouteId}?${parameters}`
}

function markdownComponentId(entry: string): string {
  const parameters = new URLSearchParams({
    entry,
    "flamefront-markdown": "1",
  })

  return `${markdownRouteId}?${parameters}`
}

function browserRouteModuleId(routeDefinition: RouteDefinition): string {
  const componentEntry =
    routeDefinition.content === "markdown"
      ? markdownComponentId(routeDefinition.entry)
      : routeDefinition.entry

  return generatesHydrationBoundary(routeDefinition)
    ? hydrationComponentId(componentEntry, routeDefinition.hydration)
    : componentEntry
}

function generatedRouteId(kind: "layout" | "route", location: string): string {
  return `flamefront:${kind}:${location}`
}

function generatedRouteMetadata(
  config: RouteConfig,
  location: string,
  parent: string,
): GeneratedRouteMetadata {
  if ("children" in config) {
    const id = generatedRouteId("layout", location)

    return {
      id,
      boundary: id,
      kind: "layout",
      entry: config.entry,
      parent,
      navigation: "router",
    }
  }

  const id = generatedRouteId("route", location)

  return {
    id,
    boundary: id,
    kind: "route",
    entry: config.entry,
    parent,
    path: config.path,
    render: config.render,
    navigation: config.render === "client" ? "router" : "fragment",
    hydration: config.hydration,
  }
}

function generateRoutePreloaders(routeTree: readonly RouteConfig[]): string {
  const preloaders = new Map<string, string[]>()

  const visit = (
    configs: readonly RouteConfig[],
    layoutEntries: readonly string[],
  ) => {
    for (const config of configs) {
      if ("children" in config) {
        visit(config.children, [...layoutEntries, config.entry])
        continue
      }

      if (config.render !== "client") {
        continue
      }

      const imports = [...layoutEntries, browserRouteModuleId(config)]
      const existing = preloaders.get(config.entry) ?? []

      for (const entry of imports) {
        if (!existing.includes(entry)) {
          existing.push(entry)
        }
      }

      preloaders.set(config.entry, existing)
    }
  }

  visit(routeTree, [])
  const entries = [...preloaders.entries()]
    .map(([entry, imports]) => {
      const preload = imports
        .map((moduleId) => `import(${quote(moduleId)})`)
        .join(", ")

      return `\t${quote(entry)}: () => Promise.all([${preload}])`
    })
    .join(",\n")

  return `const routePreloaders = {\n${entries}\n};\n\nexport function preloadRoute(entry) {\n\tconst preload = routePreloaders[entry];\n\treturn preload ? preload().then(() => undefined) : Promise.resolve();\n}\n`
}

function lazyRoute(
  routeDefinition: RouteDefinition,
  routing: NormalizedRoutingOptions,
  metadata: GeneratedRouteMetadata,
): string {
  const { entry } = routeDefinition
  const browserLoader =
    routeDefinition.render === "client" ? "loadRouteData" : "loadRouteFragment"
  const browserLoaderExpression =
    routeDefinition.render === "client"
      ? `(args) => ${browserLoader}(args, ${JSON.stringify(routing)})`
      : `(args) => ${browserLoader}(args, ${JSON.stringify(routing)}, ${quote(routeDefinition.render)})`
  const browserActionExpression = `(args) => submitRouteAction(args, ${JSON.stringify(routing)})`

  if (routeDefinition.render !== "client") {
    const componentId = browserRouteModuleId(routeDefinition)

    return `async () => { if (import.meta.env.SSR) { const [routeModule, componentModule] = await Promise.all([import(${quote(entry)}), import(${quote(componentId)})]); return { Component: createRouteBoundary(componentModule.default, ${JSON.stringify(metadata)}), loader: routeModule.loader, action: routeModule.action }; } const componentModule = await import(${quote(componentId)}); return { Component: createRouteFragmentRoute({ metadata: ${JSON.stringify(metadata)}, routing: ${JSON.stringify(routing)}, policy: ${quote(routeDefinition.render)}, fallbackComponent: componentModule.default }), loader: ${browserLoaderExpression}, action: ${browserActionExpression} }; }`
  }

  if (routeDefinition.render === "client") {
    if (routeDefinition.content === "markdown") {
      const componentId = browserRouteModuleId(routeDefinition)

      return `async () => { if (import.meta.env.SSR) return {}; const componentModule = await import(${quote(componentId)}); return { Component: createRouteBoundary(componentModule.default, ${JSON.stringify(metadata)}), loader: ${browserLoaderExpression}, action: ${browserActionExpression} }; }`
    }

    return `async () => { if (import.meta.env.SSR) return {}; const routeModule = await import(${quote(entry)}); return { Component: createRouteBoundary(routeModule.default, ${JSON.stringify(metadata)}), loader: ${browserLoaderExpression}, action: ${browserActionExpression} }; }`
  }

  throw new Error(`Unsupported route render mode ${routeDefinition.render}.`)
}

function collectRouteMetadata(
  routeTree: readonly RouteConfig[],
  shell: string,
  shellHydration: AppDefinition["shellHydration"],
): readonly GeneratedRouteMetadata[] {
  const rootId = "flamefront:shell:root"
  const metadata: GeneratedRouteMetadata[] = [
    {
      id: rootId,
      boundary: rootId,
      kind: "shell",
      entry: shell,
      navigation: "router",
      hydration: shellHydration,
    },
  ]

  const visit = (
    configs: readonly RouteConfig[],
    parent: string,
    locationPrefix = "",
  ) => {
    configs.forEach((config, index) => {
      const location = locationPrefix
        ? `${locationPrefix}.${index}`
        : String(index)
      const node = generatedRouteMetadata(config, location, parent)

      metadata.push(node)
      if ("children" in config) {
        visit(config.children, node.id, location)
      }
    })
  }

  visit(routeTree, rootId)
  return metadata
}

function generateConfigs(
  configs: readonly RouteConfig[],
  routing: NormalizedRoutingOptions,
  depth = 1,
  parent = "flamefront:shell:root",
  locationPrefix = "",
): string {
  const indent = "\t".repeat(depth)
  const childIndent = "\t".repeat(depth + 1)

  return configs
    .map((config, index) => {
      const location = locationPrefix
        ? `${locationPrefix}.${index}`
        : String(index)
      const metadata = generatedRouteMetadata(config, location, parent)

      if ("children" in config) {
        return `${indent}{\n${childIndent}id: ${quote(metadata.id)},\n${childIndent}lazy: ${lazyLayout(config.entry, metadata)},\n${childIndent}handle: { flamefront: ${JSON.stringify(metadata)} },\n${childIndent}children: [\n${generateConfigs(config.children, routing, depth + 2, metadata.id, location)}\n${childIndent}],\n${indent}}`
      }

      if (/\.(md|mdx)$/.test(cleanModuleId(config.entry))) {
        const lazy = lazyRoute(config, routing, metadata)

        return `${indent}{\n${childIndent}id: ${quote(metadata.id)},\n${childIndent}path: ${quote(config.path)},\n${childIndent}lazy: async () => { const [routeModule, resolved] = await Promise.all([import(${quote(config.entry)}), (${lazy})()]); return { ...resolved, handle: { flamefront: ${JSON.stringify(metadata)}, frontmatter: routeModule.frontmatter ?? {} } }; },\n${indent}}`
      }

      return `${indent}{\n${childIndent}id: ${quote(metadata.id)},\n${childIndent}path: ${quote(config.path)},\n${childIndent}lazy: ${lazyRoute(config, routing, metadata)},\n${childIndent}handle: { flamefront: ${JSON.stringify(metadata)} },\n${indent}}`
    })
    .join(",\n")
}

export function generateRemixRoutes(
  app: Pick<
    AppDefinition,
    "shell" | "shellHydration" | "routeTree" | "routing" | "document"
  >,
): string {
  const rootId = "flamefront:shell:root"
  const routeMetadata = collectRouteMetadata(
    app.routeTree,
    app.shell,
    app.shellHydration,
  )
  const documentImport = app.document
    ? `import Document from ${quote(app.document)};\nimport { createDocumentShell } from 'flamefront/document';\n`
    : ""
  const shellComponent = `createRouteBoundary(Shell, ${JSON.stringify(routeMetadata[0])})`
  const rootComponent = app.document
    ? `createDocumentShell(Document, ${shellComponent})`
    : shellComponent

  return `// Generated by Flamefront.\n${documentImport}import Shell from ${quote(app.shell)};\nimport { RouterDocument } from 'flamefront/octane/router-document';\nimport { createRouteBoundary, createRouteFragmentRoute } from 'flamefront/fragment';\nimport { loadRouteData, loadRouteFragment } from 'flamefront/remix-router/data';\nimport { submitRouteAction } from 'flamefront/remix-router/data';\n\nexport { RouterDocument };\nexport const routing = ${JSON.stringify(app.routing)};\nexport const routeMetadata = ${JSON.stringify(routeMetadata)};\n\nexport const routes = [\n\t{\n\t\tid: ${quote(rootId)},\n\t\tComponent: ${rootComponent},\n\t\thandle: { flamefront: ${JSON.stringify(routeMetadata[0])} },\n\t\tchildren: [\n${generateConfigs(app.routeTree, app.routing, 3)}\n\t\t],\n\t},\n];\n\n${generateRoutePreloaders(app.routeTree)}`
}

/** Generate the server-only route-module importer used by loader endpoints. */
export function generateServerRoutes(
  app: Pick<AppDefinition, "routes" | "shell" | "routeTree">,
): string {
  const entries = new Set<string>([app.shell])
  const collect = (configs: readonly RouteConfig[]) => {
    for (const config of configs) {
      entries.add(config.entry)

      if ("children" in config) {
        collect(config.children)
      }
    }
  }

  collect(app.routeTree)

  const imports = [...entries]
    .map((entry) => `\t${quote(entry)}: () => import(${quote(entry)})`)
    .join(",\n")

  return `// Generated by Flamefront.\nconst routeModules = {\n${imports}\n};\n\nlet actionModulesPromise;\nexport function loadActions() {\n\tactionModulesPromise ??= Promise.all(Object.values(routeModules).map((load) => load())).then(() => undefined);\n\treturn actionModulesPromise;\n}\n\nexport async function importRoute(entry) {\n\tconst importModule = routeModules[entry];\n\tif (!importModule) throw new Error(\`No Vite route module was generated for \${entry}.\`);\n\treturn importModule();\n}\n\nimportRoute.loadActions = loadActions;\n`
}

/** Generate the server-entry import selected by `flamefront({...})`. */
export function generateServerEntry(output: ResolvedFlamefrontOutput): string {
  if (output.adapter === "srvx") {
    return `// Generated by Flamefront.\nexport { createSrvxServerEntry as createServerEntry } from "flamefront/srvx";\n`
  }

  return `// Generated by Flamefront.\nexport { createFetchServerEntry as createServerEntry } from "flamefront/fetch";\n`
}

function hydrationStrategy(hydration: GeneratedHydration | "none"): {
  readonly importName: string
  readonly expression: string
} {
  if (hydration === "none") {
    return { importName: "never", expression: "never()" }
  }

  const { when, ...options } = hydration

  switch (when) {
    case "idle":
      return {
        importName: "idle",
        expression: `idle(${JSON.stringify(options)})`,
      }
    case "visible":
      return {
        importName: "visible",
        expression: `visible(${JSON.stringify(options)})`,
      }
    case "interaction":
      return {
        importName: "interaction",
        expression: `interaction(${JSON.stringify(options)})`,
      }
    case "media":
      return {
        importName: "media",
        expression: `media(${quote(hydration.query)})`,
      }
  }
}

/** Generate the component adapter used when a route entry exports HTML. */
export function generateMarkdownRoute(entry: string): string {
  return `import html from ${quote(entry)};\n\nexport default function MarkdownRoute() @{\n\t<div dangerouslySetInnerHTML={{ __html: html }} />\n}\n`
}

export function generateHydrationRoute(
  entry: string,
  hydration: GeneratedHydration | "none",
): string {
  const strategy = hydrationStrategy(hydration)

  return `import { Hydrate } from 'octane';\nimport { ${strategy.importName} } from 'octane/hydration';\nimport Component from ${quote(entry)};\n\nexport default function HydrationRoute(props) @{\n\t<Hydrate when={${strategy.expression}}>\n\t\t<Component {...props} />\n\t</Hydrate>\n}\n`
}

interface TransformOptions {
  readonly ssr?: boolean
}

interface ResolveOptions extends TransformOptions {
  readonly scan?: boolean
  custom?: Record<string, unknown>
}

interface PluginContext {
  readonly environment?: {
    readonly config?: { readonly command?: string; readonly consumer?: string }
  }
  resolve(
    id: string,
    importer: string | undefined,
    options: ResolveOptions,
  ): Promise<{ readonly id: string } | null>
}

interface OutputAsset {
  readonly type: "asset"
  readonly fileName: string
  source: string | Uint8Array
}

interface OutputChunk {
  readonly type: "chunk"
  map?: SourceMapLike | null
}

type OutputBundle = Record<string, OutputAsset | OutputChunk>

interface SourceMapLike {
  sources?: string[]
  sourcesContent?: (string | null)[]
}

function cleanModuleId(id: string): string {
  return id.split("?", 1)[0].replaceAll("\\", "/")
}

interface ManifestGlobTransform {
  readonly code: string
  readonly map: null
  readonly directories: readonly string[]
}

interface TextReplacement {
  readonly end: number
  readonly start: number
  readonly text: string
}

function staticStringArgument(
  argument: Babel.Node | undefined,
): string | undefined {
  if (!argument) {
    return undefined
  }

  if (argument.type === "StringLiteral") {
    return argument.value
  }

  if (
    argument.type === "TemplateLiteral" &&
    argument.expressions.length === 0
  ) {
    return argument.quasis[0]?.value.cooked ?? ""
  }

  return undefined
}

function transformManifestGlobs(
  source: string,
  id: string,
  root: string,
): ManifestGlobTransform | null {
  const ast = parse(source, {
    sourceFilename: id,
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  })
  const globBindings = new Set<string>()

  traverse(ast, {
    ImportDeclaration(path) {
      if (path.node.source.value !== "flamefront") {
        return
      }

      for (const specifier of path.node.specifiers) {
        if (specifier.type !== "ImportSpecifier") {
          continue
        }

        const imported = specifier.imported
        const importedName =
          imported.type === "Identifier" ? imported.name : imported.value

        if (importedName === "glob") {
          globBindings.add(specifier.local.name)
        }
      }
    },
  })

  if (globBindings.size === 0) {
    return null
  }

  const replacements: TextReplacement[] = []
  const directories = new Set<string>()

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee

      if (callee.type !== "Identifier" || !globBindings.has(callee.name)) {
        return
      }

      const argument = path.node.arguments[0]
      const pattern = staticStringArgument(argument)

      if (pattern === undefined) {
        throw new TypeError(
          `flamefront glob() in ${id} requires a string-literal pattern.`,
        )
      }

      if (
        typeof argument?.start !== "number" ||
        typeof argument.end !== "number"
      ) {
        throw new TypeError(`flamefront glob() in ${id} has no source range.`)
      }

      const files = expandGlob(root, pattern)

      replacements.push({
        start: argument.start,
        end: argument.end,
        text: JSON.stringify(files),
      })
      directories.add(globDirectory(root, pattern))
    },
  })

  if (replacements.length === 0) {
    return null
  }

  const code = [...replacements]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (result, replacement) =>
        `${result.slice(0, replacement.start)}${replacement.text}${result.slice(replacement.end)}`,
      source,
    )

  return { code, map: null, directories: [...directories] }
}

function isPathWithinDirectory(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate)

  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  )
}

function isServerEnvironment(
  context: Pick<PluginContext, "environment">,
  options?: TransformOptions,
): boolean {
  return (
    options?.ssr === true || context.environment?.config?.consumer === "server"
  )
}

function resolveRouteEntry(root: string, entry: string): string {
  const relativeEntry = entry.startsWith("/") ? `.${entry}` : entry

  return cleanModuleId(path.resolve(root, relativeEntry))
}

function routeSourceSuffix(entry: string): string {
  return cleanModuleId(entry).replace(/^\.?(?:\/|$)/, "")
}

export function omitRouteSourceContent(
  bundle: OutputBundle,
  routes: readonly Pick<RouteDefinition, "entry">[],
): void {
  const routeSuffixes = new Set(
    routes.map((route) => routeSourceSuffix(route.entry)),
  )
  const omitFromSourceMap = (sourceMap: SourceMapLike): boolean => {
    if (!sourceMap.sources || !sourceMap.sourcesContent) {
      return false
    }

    let changed = false

    for (let index = 0; index < sourceMap.sources.length; index += 1) {
      const source = cleanModuleId(sourceMap.sources[index]).replace(
        /^(?:\.\.\/)+/,
        "",
      )

      if (!routeSuffixes.has(source)) {
        continue
      }

      if (sourceMap.sourcesContent[index] === null) {
        continue
      }

      sourceMap.sourcesContent[index] = null
      changed = true
    }

    return changed
  }

  for (const output of Object.values(bundle)) {
    if (output.type === "chunk") {
      if (output.map) {
        omitFromSourceMap(output.map)
      }

      continue
    }

    if (output.type !== "asset" || !output.fileName.endsWith(".map")) {
      continue
    }

    const serializedSourceMap =
      typeof output.source === "string"
        ? output.source
        : new TextDecoder().decode(output.source)
    const sourceMap = JSON.parse(serializedSourceMap) as SourceMapLike

    if (omitFromSourceMap(sourceMap)) {
      output.source = JSON.stringify(sourceMap)
    }
  }
}

function omitRouteSourceContentFromDirectory(
  directory: string,
  routes: readonly Pick<RouteDefinition, "entry">[],
): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      omitRouteSourceContentFromDirectory(entryPath, routes)
      continue
    }

    if (!entry.name.endsWith(".map")) {
      continue
    }

    const serializedSourceMap = fs.readFileSync(entryPath, "utf8")
    const asset: OutputAsset = {
      type: "asset",
      fileName: entry.name,
      source: serializedSourceMap,
    }
    const bundle = { [entry.name]: asset }

    omitRouteSourceContent(bundle, routes)
    if (
      typeof asset.source === "string" &&
      asset.source !== serializedSourceMap
    ) {
      fs.writeFileSync(entryPath, asset.source)
    }
  }
}

export function removeServerRouteExports(source: string, id = "route.js") {
  const ast = parse(source, { sourceType: "module" })

  if (!removeExports(ast, SERVER_ONLY_ROUTE_EXPORTS)) {
    return null
  }

  return generate(ast, {
    sourceMaps: true,
    filename: id,
    sourceFileName: cleanModuleId(id),
  })
}

export function flamefront(options: FlamefrontOptions = {}) {
  const output = resolveFlamefrontOutput(options)

  registerFlamefrontOptions({
    prerender: options.prerender,
    markdown: options.markdown,
    target: options.target,
  })
  let root = process.cwd()
  let serverBuild = false
  let devServer: ViteDevServer | undefined
  let releaseDevTemplate: (() => void) | undefined
  let appPromise: Promise<AppDefinition> | undefined
  let manifestRevision = 0
  let manifestGlobDirectories: readonly string[] = []
  const manifestId = options.routes ?? "/src/app.ts"
  const manifestPath = () =>
    path.resolve(
      root,
      manifestId.startsWith("/") ? `.${manifestId}` : manifestId,
    )
  const loadApp = async () => {
    const manifestUrl = new URL(pathToFileURL(manifestPath()))

    manifestUrl.searchParams.set("flamefront", String(manifestRevision))
    setGlobRoot(root)
    appPromise ??= import(manifestUrl.href).then((module) => {
      const app = module.app ?? module.default

      if (!app?.routeTree || typeof app.shell !== "string") {
        throw new TypeError(
          `Flamefront route manifest ${manifestId} must export an app with a shell.`,
        )
      }

      return app as AppDefinition
    })
    return appPromise
  }

  const loadRoutes = async () => (await loadApp()).routes
  const loadRouteModuleIds = async () =>
    new Set(
      (await loadRoutes()).map((route) => resolveRouteEntry(root, route.entry)),
    )
  const generateTypes = async () =>
    writeRouteImportMap(await loadApp(), { root })
  const configureRoot = (config: { readonly root: string }) => {
    root = config.root
    registerFlamefrontRoot(root, {
      prerender: options.prerender,
      markdown: options.markdown,
      target: options.target,
    })
  }

  const frameworkModulesPlugin = {
    name: "flamefront:framework-modules",
    enforce: "pre" as const,
    configResolved: configureRoot,
    configureServer(server: ViteDevServer) {
      devServer = server
      const registry = globalThis as typeof globalThis & {
        [key: symbol]: Map<string, (url: string) => Promise<string>> | undefined
      }
      const key = Symbol.for(devTemplateLoadersKey)
      const loaders = (registry[key] ??= new Map())
      const loadTemplate = async (url: string) =>
        server.transformIndexHtml(
          url,
          await readProjectTemplate(root, Boolean((await loadApp()).document)),
        )

      loaders.set(root, loadTemplate)
      releaseDevTemplate = () => {
        if (loaders.get(root) === loadTemplate) {
          loaders.delete(root)
        }
      }
    },
    closeBundle() {
      releaseDevTemplate?.()
    },
    async buildStart() {
      await generateTypes()
    },
    transform(
      this: object,
      source: string,
      id: string,
      transformOptions?: TransformOptions,
    ) {
      const context = this as Pick<PluginContext, "environment">

      if (
        isServerEnvironment(context, transformOptions) &&
        !cleanModuleId(id).endsWith(".tsrx") &&
        source.includes("action") &&
        /flamefront(?:\/server)?["']/.test(source)
      ) {
        const transformedActions = transformServerActions(source, id)

        if (transformedActions) {
          return {
            code: transformedActions.code,
            map: transformedActions.map,
          }
        }
      }

      if (
        !cleanModuleId(id).endsWith(".tsrx") &&
        source.includes("action") &&
        /flamefront(?:\/server)?["']/.test(source)
      ) {
        const clientActions = findActionExports(source, id)

        if (clientActions.length > 0) {
          throw new Error(
            `Flamefront actions must be declared in a *.server.ts module: ${JSON.stringify(path.relative(root, cleanModuleId(id)) || id)}.`,
          )
        }
      }

      if (cleanModuleId(id) !== manifestPath()) {
        return null
      }

      const transformed = transformManifestGlobs(source, id, root)

      manifestGlobDirectories = transformed?.directories ?? []
      return transformed
        ? { code: transformed.code, map: transformed.map }
        : null
    },
    async handleHotUpdate(context: {
      file: string
      server: {
        moduleGraph: {
          getModuleById(id: string): unknown
          invalidateModule(module: unknown): void
        }
      }
    }) {
      const manifestChanged = context.file === manifestPath()
      const globChanged = manifestGlobDirectories.some((directory) =>
        isPathWithinDirectory(directory, context.file),
      )

      if (!manifestChanged && !globChanged) {
        return
      }

      manifestRevision += 1
      appPromise = undefined
      try {
        await generateTypes()
      } catch {
        // Keep the previous declarations while an edited manifest is invalid.
        // Vite will report the manifest error when the virtual route modules
        // are requested, but a stale type file must not block editing.
      }

      if (globChanged) {
        const manifestModule =
          context.server.moduleGraph.getModuleById(manifestPath())

        if (manifestModule) {
          context.server.moduleGraph.invalidateModule(manifestModule)
        }
      }

      for (const moduleId of [
        resolvedRemixRoutesId,
        resolvedServerRoutesId,
        resolvedServerEntryId,
      ]) {
        const generatedModule =
          context.server.moduleGraph.getModuleById(moduleId)

        if (generatedModule) {
          context.server.moduleGraph.invalidateModule(generatedModule)
        }
      }
    },
    async resolveId(
      this: PluginContext,
      id: string,
      importer?: string,
      resolveOptions: ResolveOptions = {},
    ) {
      if (
        id === path.resolve(root, "index.html") &&
        !fs.existsSync(id) &&
        (await loadApp()).document
      ) {
        return id
      }

      if (id === remixRoutesId) {
        return resolvedRemixRoutesId
      }

      if (id === serverRoutesId) {
        return resolvedServerRoutesId
      }

      if (id === serverEntryId) {
        return resolvedServerEntryId
      }

      if (id === "flamefront/entry") {
        return resolvedServerEntryId
      }

      if (
        id === "./hydration-route.tsrx?octane-hydrate=0" &&
        importer?.startsWith(resolvedHydrationRoutePrefix)
      ) {
        const parameters = new URLSearchParams(
          importer.slice(importer.indexOf("?") + 1),
        )

        parameters.set("octane-hydrate", "0")
        return `${hydrationRouteId}?${parameters}`
      }

      if (id.startsWith(resolvedHydrationRoutePrefix)) {
        return id
      }

      if (id.startsWith(resolvedMarkdownRoutePrefix)) {
        return id
      }

      if (id.startsWith(actionProxyPrefix)) {
        return id
      }

      if (
        resolveOptions.scan ||
        isServerEnvironment(this, resolveOptions) ||
        resolveOptions.custom?.["flamefront:server-module"]
      ) {
        return null
      }

      const nestedOptions: ResolveOptions = {
        ...resolveOptions,
        custom: { ...resolveOptions.custom, "flamefront:server-module": true },
      }
      const resolved = await this.resolve(id, importer, nestedOptions)

      if (!resolved) {
        return null
      }

      const resolvedId = cleanModuleId(resolved.id)

      if (
        !serverFilePattern.test(resolvedId) &&
        !serverDirectoryPattern.test(resolvedId)
      ) {
        return null
      }

      if (!importer || importer.endsWith(".html")) {
        return null
      }

      let actionSource: string

      try {
        actionSource = fs.readFileSync(resolvedId, "utf8")
      } catch {
        actionSource = ""
      }

      if (actionSource) {
        const actions = findActionExports(actionSource, resolvedId)

        if (actions.length > 0) {
          return `${actionProxyPrefix}${encodeURIComponent(resolvedId)}`
        }
      }

      const importerId = cleanModuleId(importer)
      const importerLabel = path.relative(root, importerId) || importerId
      const routeHint = (await loadRouteModuleIds()).has(importerId)
        ? " Flamefront removes server imports used exclusively by `loader` or `action`, but this import is still referenced by client code."
        : ""

      throw new Error(
        `Server-only module ${JSON.stringify(id)} was referenced by client module ${JSON.stringify(importerLabel)}.${routeHint}`,
      )
    },
    async load(id: string) {
      if (
        id === path.resolve(root, "index.html") &&
        !fs.existsSync(id) &&
        (await loadApp()).document
      ) {
        return readProjectTemplate(root, true)
      }

      if (id === resolvedRemixRoutesId) {
        return generateRemixRoutes(await loadApp())
      }

      if (id === resolvedServerRoutesId) {
        return generateServerRoutes(await loadApp())
      }

      if (id === resolvedServerEntryId) {
        if (devServer && (await loadApp()).document) {
          // Development renders static routes too; production artifacts may be
          // stale and must not bypass Vite's current document or asset graph.
          return `import { createFetchServerEntry } from 'flamefront/fetch';\nexport function createServerEntry(options) {\n  const entry = createFetchServerEntry({ ...options, ${output.adapter === "srvx" ? "middleware: undefined," : ""} assets: { loadTemplate: options.assets.loadTemplate ?? (({ request }) => globalThis[Symbol.for(${quote(devTemplateLoadersKey)})].get(${quote(root)})(new URL(request.url).pathname)) } });\n  return ${output.adapter === "srvx" ? "{ ...entry, middleware: options.middleware }" : "entry"};\n}`
        }

        return generateServerEntry(output)
      }

      if (id.startsWith(resolvedHydrationRoutePrefix)) {
        const parameters = new URLSearchParams(id.slice(id.indexOf("?") + 1))
        const entry = parameters.get("entry")
        const serializedHydration = parameters.get("hydration")

        if (!entry || !serializedHydration) {
          throw new TypeError(
            "Flamefront hydration route is missing its configuration.",
          )
        }

        return generateHydrationRoute(
          entry,
          JSON.parse(serializedHydration) as GeneratedHydration | "none",
        )
      }

      if (id.startsWith(resolvedMarkdownRoutePrefix)) {
        const parameters = new URLSearchParams(id.slice(id.indexOf("?") + 1))
        const entry = parameters.get("entry")

        if (!entry) {
          throw new TypeError("Flamefront Markdown route is missing its entry.")
        }

        return generateMarkdownRoute(entry)
      }

      if (id.startsWith(actionProxyPrefix)) {
        const moduleId = new URLSearchParams(
          id.slice(actionProxyId.length + 1),
        ).get("module")

        if (!moduleId) {
          throw new TypeError("Flamefront action proxy is missing its module.")
        }

        const source = fs.readFileSync(moduleId, "utf8")

        return generateActionProxyModule(
          findActionExports(source, moduleId),
          (await loadApp()).routing,
        )
      }

      return null
    },
  }

  const routeModulePlugin = {
    name: "flamefront:route-modules",
    enforce: "post" as const,
    configResolved(config: {
      readonly root: string
      readonly build?: { readonly ssr?: unknown }
    }) {
      configureRoot(config)
      serverBuild = Boolean(config.build?.ssr)
    },
    async generateBundle(_outputOptions: unknown, bundle: OutputBundle) {
      if (!serverBuild) {
        omitRouteSourceContent(bundle, await loadRoutes())
      }
    },
    async writeBundle(outputOptions: { readonly dir?: string }) {
      // Rollup serializes chunk maps after generateBundle, and other plugins can
      // emit late client chunks. Scrub the completed output as the final guard.
      if (!serverBuild && outputOptions.dir) {
        omitRouteSourceContentFromDirectory(
          outputOptions.dir,
          await loadRoutes(),
        )
      }
    },
    async transform(
      this: PluginContext,
      source: string,
      id: string,
      transformOptions?: TransformOptions,
    ) {
      if (isServerEnvironment(this, transformOptions)) {
        return null
      }

      if (!(await loadRouteModuleIds()).has(cleanModuleId(id))) {
        return null
      }

      const transformed = removeServerRouteExports(source, id)

      if (!transformed) {
        return null
      }

      return { code: transformed.code, map: transformed.map }
    },
  }

  const markdownPlugin =
    options.markdown === false
      ? undefined
      : vitePluginSatteri({
          ...(options.markdown ?? {}),
          features: {
            gfm: true,
            frontmatter: true,
            ...options.markdown?.features,
          },
          mdx:
            options.markdown?.mdx === false
              ? false
              : {
                  ...(typeof options.markdown?.mdx === "object"
                    ? options.markdown.mdx
                    : {}),
                  jsx: true,
                  jsxImportSource: "octane",
                  jsxRuntime: "automatic",
                },
        })

  const mdxCompilerPlugin =
    options.markdown === false || options.markdown?.mdx === false
      ? undefined
      : {
          name: "flamefront:markdown-mdx",
          async transform(
            this: PluginContext,
            source: string,
            id: string,
            transformOptions?: TransformOptions,
          ): Promise<{ code: string; map: object | null } | null> {
            if (!cleanModuleId(id).endsWith(".mdx")) {
              return null
            }

            const server = isServerEnvironment(this, transformOptions)
            const command = this.environment?.config?.command
            const compiled = compileOctane(source, id, {
              dev: command === "serve",
              hmr: command === "serve" && !server ? "vite" : false,
              mode: server ? "server" : "client",
            })

            return { code: compiled.code, map: compiled.map }
          },
        }

  return [
    frameworkModulesPlugin,
    routeModulePlugin,
    markdownPlugin,
    mdxCompilerPlugin,
  ] as const
}
