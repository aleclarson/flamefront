import { relative, resolve, sep } from "node:path"
import type { RouteDefinition } from "./index.ts"

function isWithin(directory: string, filePath: string): boolean {
  const pathFromDirectory = relative(directory, filePath)

  return (
    pathFromDirectory === "" ||
    (pathFromDirectory !== ".." &&
      !pathFromDirectory.startsWith(`..${sep}`) &&
      !pathFromDirectory.startsWith(sep))
  )
}

export function staticRoutePathForPath(
  clientDirectory: string,
  routePath: string,
): string {
  if (/[:*]/.test(routePath)) {
    throw new Error(
      `Cannot prerender parameterized static route ${JSON.stringify(routePath)} without concrete paths.`,
    )
  }

  const segments = routePath
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))

  if (
    segments.some(
      (segment) => segment === "." || segment === ".." || segment.includes("/"),
    )
  ) {
    throw new Error(
      `Cannot write unsafe static route path ${JSON.stringify(routePath)}.`,
    )
  }

  const filePath = resolve(clientDirectory, ...segments, "index.html")

  if (!isWithin(clientDirectory, filePath)) {
    throw new Error(
      `Cannot write static route outside the client build: ${JSON.stringify(routePath)}.`,
    )
  }

  return filePath
}

function staticRoutePath(
  clientDirectory: string,
  route: RouteDefinition,
): string {
  return staticRoutePathForPath(clientDirectory, route.path)
}

export function staticRouteFile(
  clientDirectory: string,
  route: RouteDefinition,
): string {
  return staticRoutePath(clientDirectory, route)
}

export function staticRouteDataFile(
  clientDirectory: string,
  route: RouteDefinition,
): string {
  return staticRoutePath(clientDirectory, route).replace(
    /\.html$/,
    ".data.json",
  )
}

export function staticRouteFragmentFile(
  clientDirectory: string,
  route: RouteDefinition,
): string {
  return staticRoutePath(clientDirectory, route).replace(
    /\.html$/,
    ".fragment.html",
  )
}

export function staticRouteFragmentDataFile(
  clientDirectory: string,
  route: RouteDefinition,
): string {
  return staticRoutePath(clientDirectory, route).replace(
    /\.html$/,
    ".fragment.json",
  )
}
