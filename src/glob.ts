/** A project-root file discovered by a Flamefront route glob. */
export interface GlobFile {
  /** Vite project-root module ID, such as `/src/docs/guide.md`. */
  readonly path: string
  /** Path relative to the glob's static directory, with POSIX separators. */
  readonly relativePath: string
  /** Extension-stripped route fragment; directory indexes are empty. */
  readonly route: string
}

interface NodeProcessLike {
  cwd?: () => string
  getBuiltinModule?: (name: string) => unknown
}

interface NodeFileSystem {
  globSync(pattern: string): string[]
  statSync(file: string): { isFile(): boolean }
}

interface NodePath {
  resolve(...paths: string[]): string
  relative(from: string, to: string): string
}

interface NodeRuntime {
  readonly fs: NodeFileSystem
  readonly path: NodePath
}

let configuredRoot: string | undefined

function nodeProcess(): NodeProcessLike | undefined {
  return (globalThis as typeof globalThis & { process?: NodeProcessLike })
    .process
}

function nodeRuntime(): NodeRuntime {
  const processValue = nodeProcess()
  const getBuiltinModule = processValue?.getBuiltinModule

  if (typeof getBuiltinModule !== "function") {
    throw new Error(
      "flamefront glob() can only expand files in a Node route manifest.",
    )
  }

  const fs = getBuiltinModule("node:fs") as NodeFileSystem
  const path = getBuiltinModule("node:path") as NodePath

  if (
    !fs ||
    typeof fs.globSync !== "function" ||
    typeof fs.statSync !== "function" ||
    !path ||
    typeof path.resolve !== "function" ||
    typeof path.relative !== "function"
  ) {
    throw new Error("flamefront glob() requires Node's built-in glob support.")
  }

  return { fs, path }
}

function normalizeProjectPath(value: string): string {
  const normalized = value.replaceAll("\\", "/")

  return normalized.startsWith("/") ? normalized : `/${normalized}`
}

function hasGlobMagic(segment: string): boolean {
  return ["*", "?", "[", "]", "{", "}"].some((character) =>
    segment.includes(character),
  )
}

function staticGlobDirectory(pattern: string): string {
  const segments = pattern.split("/")
  const firstMagicSegment = segments.findIndex(hasGlobMagic)
  const directorySegments =
    firstMagicSegment === -1
      ? segments.slice(0, -1)
      : segments.slice(0, firstMagicSegment)
  const directory = directorySegments.filter(Boolean).join("/")

  return directory ? `/${directory}` : "/"
}

/** Resolve the static directory watched by a project-root glob. */
export function globDirectory(root: string, pattern: string): string {
  if (typeof root !== "string" || root.length === 0) {
    throw new TypeError("flamefront glob root must be a non-empty string.")
  }

  if (typeof pattern !== "string" || pattern.length === 0) {
    throw new TypeError("flamefront glob pattern must be a non-empty string.")
  }

  const runtime = nodeRuntime()
  const projectRoot = runtime.path.resolve(root)
  const projectPattern = normalizeProjectPath(pattern)

  return runtime.path.resolve(
    projectRoot,
    `.${staticGlobDirectory(projectPattern)}`,
  )
}

function routeFragment(relativePath: string): string {
  const withoutExtension = relativePath.replace(/\.[^./]+$/, "")
  const segments = withoutExtension.split("/")

  if (segments.at(-1) === "index") {
    segments.pop()
  }

  return segments.join("/")
}

function isWithin(root: string, candidate: string, runtime: NodeRuntime) {
  const relative = runtime.path.relative(root, candidate)

  return (
    relative === "" || (!relative.startsWith("..") && !relative.startsWith("/"))
  )
}

/** Expand a project-root glob into stable, importable file descriptors. */
export function expandGlob(root: string, pattern: string): readonly GlobFile[] {
  if (typeof root !== "string" || root.length === 0) {
    throw new TypeError("flamefront glob root must be a non-empty string.")
  }

  if (typeof pattern !== "string" || pattern.length === 0) {
    throw new TypeError("flamefront glob pattern must be a non-empty string.")
  }

  const runtime = nodeRuntime()
  const projectPattern = normalizeProjectPath(pattern)
  const projectRoot = runtime.path.resolve(root)
  const absolutePattern = runtime.path.resolve(
    projectRoot,
    `.${projectPattern}`,
  )
  const globDirectory = staticGlobDirectory(projectPattern)
  const absoluteGlobDirectory = runtime.path.resolve(
    projectRoot,
    `.${globDirectory}`,
  )
  const matches = runtime.fs
    .globSync(absolutePattern)
    .map((match) => runtime.path.resolve(match))
    .filter((match) => runtime.fs.statSync(match).isFile())
    .sort()

  return Object.freeze(
    matches.map((match) => {
      if (!isWithin(projectRoot, match, runtime)) {
        throw new TypeError(
          `flamefront glob match escapes the project root: ${match}`,
        )
      }

      const relativePath = runtime.path
        .relative(absoluteGlobDirectory, match)
        .replaceAll("\\", "/")

      if (
        !relativePath ||
        relativePath === ".." ||
        relativePath.startsWith("../")
      ) {
        throw new TypeError(
          `flamefront glob match is outside its static directory: ${match}`,
        )
      }

      const projectPath = runtime.path
        .relative(projectRoot, match)
        .replaceAll("\\", "/")

      return Object.freeze({
        path: `/${projectPath}`,
        relativePath,
        route: routeFragment(relativePath),
      })
    }),
  )
}

/** Set the project root used when a route manifest expands a glob directly. */
export function setGlobRoot(root: string | undefined): void {
  configuredRoot = root
}

/**
 * Expand a project-root glob and map each discovered file into a route config.
 * The array overload is used by Flamefront's Vite transform for browser builds.
 */
export function glob<Result>(
  pattern: string,
  map: (file: GlobFile) => Result,
): readonly Result[]
export function glob<Result>(
  files: readonly GlobFile[],
  map: (file: GlobFile) => Result,
): readonly Result[]
export function glob<Result>(
  patternOrFiles: string | readonly GlobFile[],
  map: (file: GlobFile) => Result,
): readonly Result[] {
  if (typeof map !== "function") {
    throw new TypeError("flamefront glob mapper must be a function.")
  }

  let files: readonly GlobFile[]

  if (typeof patternOrFiles === "string") {
    const root =
      configuredRoot ??
      nodeProcess()?.cwd?.() ??
      (() => {
        throw new Error(
          "flamefront glob() requires a Node project root when used outside Vite.",
        )
      })()

    files = expandGlob(root, patternOrFiles)
  } else {
    files = patternOrFiles
  }

  return Object.freeze(files.map(map))
}
