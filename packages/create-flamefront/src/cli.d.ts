export type PackageManager = "bun" | "npm" | "pnpm" | "yarn"

export interface CreateProjectOptions {
  readonly cwd?: string
  readonly install?: boolean
  readonly installDependencies?: (
    packageManager: PackageManager,
    directory: string,
  ) => Promise<void> | void
  readonly packageManager?: PackageManager
}

export interface CreatedProject {
  readonly name: string
  readonly packageManager: PackageManager
  readonly targetDirectory: string
}

export function detectPackageManager(
  environment?: Record<string, string | undefined>,
): PackageManager

export function projectName(directory: string): string

export function createProject(
  directory: string,
  options?: CreateProjectOptions,
): Promise<CreatedProject>

export function run(
  arguments_: readonly string[],
  options?: Omit<CreateProjectOptions, "install">,
): Promise<void>
