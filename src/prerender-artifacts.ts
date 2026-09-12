import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { RouteDefinition } from "./index.ts"
import type { NormalizedRoutingOptions } from "./index.ts"
import { joinBasename } from "./index.ts"
import type { RenderDocumentResult } from "./server.ts"
import {
  routeFragmentProtocol,
  type RouteFragmentArtifact,
} from "./fragment-client.ts"
import {
  staticRouteDataFile,
  staticRouteFile,
  staticRouteFragmentDataFile,
  staticRouteFragmentFile,
} from "./static-fragment-artifacts.ts"

/** The complete render result needed to publish one static route. */
export interface StaticRouteArtifact {
  readonly html: string
  readonly routeData: unknown
  readonly fragment: RouteFragmentArtifact
  readonly status: number
  /** Template metadata used for safe asset-only assembly on a later build. */
  readonly template?: {
    readonly fingerprint: string
    readonly assets: readonly string[]
  }
}

/** The normalized fields needed by the build and cache layers. */
export function documentParts(document: RenderDocumentResult): {
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

/** Render all artifacts for a route before touching the deployment directory. */
export async function renderStaticRoute(
  route: RouteDefinition,
  request: Request,
  render: (request: Request) => Promise<RenderDocumentResult>,
  loadData?: (request: Request) => Promise<unknown>,
  renderFragment?: (request: Request) => Promise<RouteFragmentArtifact>,
  template?: string,
): Promise<StaticRouteArtifact> {
  const rendered = documentParts(await render(request))
  const routeData = rendered.hasRouteData
    ? rendered.routeData
    : loadData
      ? await loadData(request)
      : null
  const fragment = renderFragment
    ? await renderFragment(request)
    : {
        protocol: routeFragmentProtocol,
        route: route.path,
        boundary: route.entry,
        html: rendered.html,
        routeData,
        boundaries: [],
        status: rendered.status,
      }

  return {
    html: rendered.html,
    routeData,
    fragment,
    status: rendered.status,
    ...(template === undefined ? {} : { template: templateMetadata(template) }),
  }
}

function assetReferences(template: string): readonly string[] {
  return [...template.matchAll(/(?:src|href)=(['"])(\/assets\/[^'"]+)\1/g)].map(
    (match) => match[2],
  )
}

function normalizedTemplate(template: string): string {
  let index = 0

  return template.replace(
    /(?:src|href)=(['"])(\/assets\/[^'"]+)\1/g,
    (_match, quote: string) =>
      `asset=${quote}__flamefront_asset_${index++}__${quote}`,
  )
}

function templateMetadata(
  template: string,
): NonNullable<StaticRouteArtifact["template"]> {
  return {
    fingerprint: normalizedTemplate(template),
    assets: assetReferences(template),
  }
}

/** Fingerprint template structure while ignoring hashed asset names. */
export function templateFingerprint(template: string): string {
  return normalizedTemplate(template)
}

/**
 * Reassemble a cached document when only Vite's hashed asset names changed.
 * Returns `null` when the surrounding template changed and a fresh render is
 * required.
 */
export function assembleStaticRouteArtifact(
  artifact: StaticRouteArtifact,
  template: string,
): StaticRouteArtifact | null {
  if (artifact.template === undefined) {
    return null
  }

  const current = templateMetadata(template)

  if (artifact.template.fingerprint !== current.fingerprint) {
    return null
  }

  const previous = artifact.template.assets

  if (previous.length !== current.assets.length) {
    return null
  }

  let html = artifact.html

  for (let index = 0; index < previous.length; index += 1) {
    html = html.replaceAll(previous[index], current.assets[index])
  }

  return { ...artifact, html, template: current }
}

/** Publish one complete route artifact into the current client output. */
export async function writeStaticRouteArtifact(
  clientDirectory: string,
  route: RouteDefinition,
  artifact: StaticRouteArtifact,
): Promise<void> {
  const outputFile = staticRouteFile(clientDirectory, route)

  await mkdir(dirname(outputFile), { recursive: true })
  await writeFile(outputFile, artifact.html)
  await writeFile(
    staticRouteDataFile(clientDirectory, route),
    JSON.stringify(artifact.routeData ?? null),
  )
  await writeFile(
    staticRouteFragmentFile(clientDirectory, route),
    artifact.fragment.html,
  )
  await writeFile(
    staticRouteFragmentDataFile(clientDirectory, route),
    JSON.stringify(artifact.fragment),
  )
}

/** Build the URL used by a static render without changing its output path. */
export function staticRouteRequest(
  routing: Pick<NormalizedRoutingOptions, "basename">,
  routePath: string,
): Request {
  return new Request(
    new URL(
      joinBasename(routing.basename, routePath),
      "http://flamefront.build",
    ),
  )
}
