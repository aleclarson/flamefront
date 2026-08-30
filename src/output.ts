export type FlamefrontTarget = "node" | "deno" | "bun"
export type FlamefrontAdapter = "fetch" | "srvx"

export interface FlamefrontOutputOptions {
  /** Select the runtime family used by the built-in srvx adapter. */
  readonly target?: FlamefrontTarget
}

export type ResolvedFlamefrontOutput =
  | {
      readonly adapter: "fetch"
      readonly target?: undefined
    }
  | {
      readonly adapter: "srvx"
      readonly target: FlamefrontTarget
    }

const targets: ReadonlySet<FlamefrontTarget> = new Set(["node", "deno", "bun"])

/** Resolve the public output options into the generated server entry kind. */
export function resolveFlamefrontOutput(
  options: FlamefrontOutputOptions = {},
): ResolvedFlamefrontOutput {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("flamefront output options must be an object.")
  }

  if (options.target !== undefined && !targets.has(options.target)) {
    throw new TypeError(
      `flamefront target must be one of "node", "deno", or "bun"; received ${JSON.stringify(options.target)}.`,
    )
  }

  const requestedAdapter = (options as { readonly adapter?: unknown }).adapter

  if (requestedAdapter !== undefined) {
    throw new TypeError(
      `flamefront adapter is not supported; omit "adapter" and use "target" for srvx or the default Web Fetch entry.`,
    )
  }

  if (options.target !== undefined) {
    return Object.freeze({ adapter: "srvx", target: options.target })
  }

  return Object.freeze({ adapter: "fetch" })
}
