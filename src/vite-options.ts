import type { PrerenderOptions } from "./prerender.ts"

export interface RegisteredFlamefrontOptions {
  readonly prerender?: PrerenderOptions
  readonly markdown?: unknown
  readonly target?: string
}

const byRoot = new Map<string, RegisteredFlamefrontOptions>()
let pending: RegisteredFlamefrontOptions | undefined

export function registerFlamefrontOptions(
  options: RegisteredFlamefrontOptions,
): void {
  pending = options
}

export function registerFlamefrontRoot(
  root: string,
  options: RegisteredFlamefrontOptions,
): void {
  byRoot.set(root, options)
}

export function getFlamefrontOptions(
  root: string,
): RegisteredFlamefrontOptions | undefined {
  return byRoot.get(root) ?? pending
}
