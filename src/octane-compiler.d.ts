declare module "octane/compiler" {
  export interface CompileOptions {
    readonly dev?: boolean
    readonly hmr?: boolean | "vite" | "webpack"
    readonly mode?: "client" | "server"
  }

  export interface CompileResult {
    readonly code: string
    readonly map: object | null
    readonly diagnostics: readonly unknown[]
  }

  export function compile(
    source: string,
    filename: string,
    options?: CompileOptions,
  ): CompileResult
}
