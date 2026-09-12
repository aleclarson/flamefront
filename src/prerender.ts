import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import type {
  AppDefinition,
  LayoutDefinition,
  RouteConfig,
  RouteDefinition,
} from "./index.ts"
import { routeFragmentProtocol } from "./fragment-client.ts"
import {
  templateFingerprint,
  type StaticRouteArtifact,
} from "./prerender-artifacts.ts"

export interface PrerenderPage {
  /** Concrete app-relative pathname, before the configured basename. */
  readonly path: string
  /** App-owned content version. Omit for the page-type default. */
  readonly key?: string | null
}

export interface PrerenderContext {
  readonly root: string
  readonly routes: readonly RouteDefinition[]
}

export type PrerenderPageSource =
  Iterable<PrerenderPage> | AsyncIterable<PrerenderPage>

export type PrerenderPageLoader = (
  context: PrerenderContext,
) => PrerenderPageSource | Promise<PrerenderPageSource>

export interface PrerenderCache {
  get(key: string): Promise<Uint8Array | null>
  put(key: string, value: Uint8Array): Promise<void>
}

export interface PrerenderOptions {
  /** Enumerate concrete pages and app-owned cache keys. */
  readonly pages?: PrerenderPageLoader
  /** Use `false` to disable all cache reads and writes. */
  readonly cache?: PrerenderCache | false
  /** Version external inputs that are not represented by page keys. */
  readonly revision?: string
}

export interface PrerenderFingerprintOptions {
  readonly markdown?: unknown
  readonly target?: string
  readonly template?: string
}

const cacheEntryVersion = 1
const artifactVersion = "flamefront-static-artifact-v1"

function stableValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === undefined) {
    return "[undefined]"
  }

  if (typeof value === "function") {
    return "[function]"
  }

  if (typeof value === "bigint") {
    return `${value}n`
  }

  if (value instanceof Uint8Array) {
    return Array.from(value)
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return "[circular]"
    }

    seen.add(value)

    if (Array.isArray(value)) {
      return value.map((item) => stableValue(item, seen))
    }

    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          stableValue((value as Record<string, unknown>)[key], seen),
        ]),
    )
  }

  return value
}

/** Create a stable SHA-256 key from bytes, strings, or JSON-compatible values. */
export function hash(value: string | Uint8Array | unknown): string {
  const input =
    typeof value === "string"
      ? value
      : value instanceof Uint8Array
        ? value
        : JSON.stringify(stableValue(value))

  return createHash("sha256").update(input).digest("hex")
}

export function cacheNamespace(root: string): string {
  return hash(resolve(root)).slice(0, 24)
}

/** The default persistent cache used by a Flamefront project. */
export function createFilesystemPrerenderCache(root: string): PrerenderCache {
  const directory = resolve(root, ".flamefront/cache", cacheNamespace(root))

  function fileFor(key: string): string {
    return resolve(directory, `${key}.bin`)
  }

  return {
    async get(key) {
      try {
        return await readFile(fileFor(key))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null
        }

        throw error
      }
    },
    async put(key, value) {
      const file = fileFor(key)
      const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`

      await mkdir(dirname(file), { recursive: true })
      await writeFile(temporary, value)
      await rename(temporary, file)
    },
  }
}

export interface CachedPrerenderArtifact {
  readonly artifact: StaticRouteArtifact
  readonly path: string
}

export function serializePrerenderArtifact(
  path: string,
  artifact: StaticRouteArtifact,
): Uint8Array {
  return Buffer.from(
    JSON.stringify({
      version: cacheEntryVersion,
      path,
      artifact,
    }),
    "utf8",
  )
}

export function deserializePrerenderArtifact(
  value: Uint8Array,
): CachedPrerenderArtifact | null {
  try {
    const parsed = JSON.parse(Buffer.from(value).toString("utf8")) as {
      version?: unknown
      path?: unknown
      artifact?: unknown
    }
    const artifact = parsed.artifact as Partial<StaticRouteArtifact> | undefined
    const fragment = artifact?.fragment as
      { html?: unknown; protocol?: unknown } | undefined

    if (
      parsed.version !== cacheEntryVersion ||
      typeof parsed.path !== "string" ||
      !artifact ||
      typeof artifact.html !== "string" ||
      typeof artifact.status !== "number" ||
      !fragment ||
      fragment.protocol !== routeFragmentProtocol ||
      typeof fragment.html !== "string"
    ) {
      return null
    }

    return parsed as unknown as CachedPrerenderArtifact
  } catch {
    return null
  }
}

function sourcePath(root: string, entry: string): string {
  return resolve(root, entry.startsWith("/") ? `.${entry}` : entry)
}

async function sourceFingerprint(
  root: string,
  entry: string,
  seen: Set<string>,
): Promise<readonly [string, string][]> {
  const file = sourcePath(root, entry)

  if (seen.has(file)) {
    return []
  }

  seen.add(file)

  let source: string

  try {
    source = await readFile(file, "utf8")
  } catch {
    return [[entry, "[missing]"]]
  }

  const result: [string, string][] = [[entry, hash(source)]]
  const imports = source.matchAll(
    /(?:from\s*|import\s*\(\s*|import\s*)(["'])(\.?\.?\/[^"']+)\1/g,
  )

  for (const match of imports) {
    const specifier = match[2]
    const imported = resolve(dirname(file), specifier)
    const candidates = [
      imported,
      ...[".ts", ".tsx", ".js", ".jsx", ".tsrx", ".md", ".mdx", ".json"].map(
        (extension) => `${imported}${extension}`,
      ),
      resolve(imported, "index.ts"),
      resolve(imported, "index.tsx"),
    ]

    let candidate: string | undefined

    for (const path of candidates) {
      try {
        await readFile(path)
        candidate = path
        break
      } catch {
        // Try the next conventional extension.
      }
    }

    if (candidate) {
      const relativeEntry = `/${relative(root, candidate).replaceAll("\\", "/")}`

      result.push(...(await sourceFingerprint(root, relativeEntry, seen)))
    }
  }

  return result
}

function layoutEntries(
  tree: readonly RouteConfig[],
  target: RouteDefinition,
  ancestors: string[] = [],
): readonly string[] | null {
  for (const config of tree) {
    if (isLayout(config)) {
      const nested = layoutEntries(config.children, target, [
        ...ancestors,
        config.entry,
      ])

      if (nested) {
        return nested
      }

      continue
    }

    if (config.path === target.path) {
      return ancestors
    }
  }

  return null
}

/** Fingerprint the route-scoped rendering inputs used by one page. */
export async function renderingFingerprint(
  root: string,
  app: AppDefinition,
  route: RouteDefinition,
  path: string,
  options: PrerenderFingerprintOptions = {},
): Promise<string> {
  const entries = [
    app.shell,
    ...(app.document ? [app.document] : []),
    ...(layoutEntries(app.routeTree, route) ?? []),
    route.entry,
    "/src/entry-server.ts",
  ]
  const sources: [string, string][] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    sources.push(...(await sourceFingerprint(root, entry, seen)))
  }

  let packageInputs: unknown = null

  try {
    const packageJson = JSON.parse(
      await readFile(resolve(root, "package.json"), "utf8"),
    ) as Record<string, unknown>

    packageInputs = {
      dependencies: packageJson.dependencies,
      devDependencies: packageJson.devDependencies,
      peerDependencies: packageJson.peerDependencies,
    }
  } catch {
    packageInputs = "[missing]"
  }

  return hash({
    artifactVersion,
    fragmentProtocol: routeFragmentProtocol,
    route: {
      path: route.path,
      concretePath: path,
      entry: route.entry,
      content: route.content,
      render: route.render,
      hydration: route.hydration,
    },
    shell: app.shell,
    document: app.document,
    shellHydration: app.shellHydration,
    routing: app.routing,
    compiler: stableValue(options),
    template: options.template
      ? templateFingerprint(options.template)
      : undefined,
    sources,
    packageInputs,
  })
}

export function cacheKey(
  path: string,
  contentKey: string,
  revision: string | undefined,
  fingerprint: string,
  namespace = "",
): string {
  return hash({
    artifactVersion,
    path,
    contentKey,
    revision: revision ?? "",
    fingerprint,
    namespace,
  })
}

export function isParameterizedRoute(path: string): boolean {
  return /[:*]/.test(path)
}

export function routeSourceFile(root: string, route: RouteDefinition): string {
  return sourcePath(root, route.entry)
}

export function isLayout(config: RouteConfig): config is LayoutDefinition {
  return "kind" in config && config.kind === "layout"
}
