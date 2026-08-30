export type FlamefrontTarget = "node" | "deno" | "bun"
export type FlamefrontAdapter = "nitro"

export interface FlamefrontOutputOptions {
  /** Select the runtime family used by the built-in srvx adapter. */
  readonly target?: FlamefrontTarget
  /** Select an advanced server adapter. Nitro takes precedence over target. */
  readonly adapter?: FlamefrontAdapter
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
  | {
      readonly adapter: "nitro"
      readonly target?: FlamefrontTarget
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

  if (options.adapter !== undefined && options.adapter !== "nitro") {
    throw new TypeError(
      `flamefront adapter must be "nitro"; received ${JSON.stringify(options.adapter)}.`,
    )
  }

  if (options.adapter === "nitro") {
    return options.target === undefined
      ? Object.freeze({ adapter: "nitro" })
      : Object.freeze({ adapter: "nitro", target: options.target })
  }

  if (options.target !== undefined) {
    return Object.freeze({ adapter: "srvx", target: options.target })
  }

  return Object.freeze({ adapter: "fetch" })
}
