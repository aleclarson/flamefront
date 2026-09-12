import { spawn } from "node:child_process"
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises"
import { basename, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const templateDirectory = fileURLToPath(
  new URL("../template/", import.meta.url),
)
const packageMetadata = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
)

const usage = `Create a Flamefront app.

Usage:
  create-flamefront <directory> [--no-install]

Options:
  --no-install  Create the project without installing dependencies
  -h, --help    Show this help
  -v, --version Show the installed create-flamefront version`

export function detectPackageManager(environment = process.env) {
  const userAgent = environment.npm_config_user_agent ?? ""
  const name = userAgent.split("/", 1)[0]

  return ["pnpm", "npm", "yarn", "bun"].includes(name) ? name : "npm"
}

export function projectName(directory) {
  const name = basename(resolve(directory))
  const valid =
    name.length <= 214 &&
    /^(?:[a-z0-9][a-z0-9._-]*)$/.test(name) &&
    !name.startsWith(".") &&
    !name.startsWith("_")

  if (!valid) {
    throw new Error(
      `${JSON.stringify(name)} is not a valid package name. Use lowercase letters, numbers, dots, hyphens, or underscores.`,
    )
  }

  return name
}

function parseArguments(arguments_) {
  let install = true
  let directory

  for (const argument of arguments_) {
    if (argument === "--no-install") {
      install = false
    } else if (argument === "-h" || argument === "--help") {
      return { help: true }
    } else if (argument === "-v" || argument === "--version") {
      return { version: true }
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`)
    } else if (directory === undefined) {
      directory = argument
    } else {
      throw new Error("Provide exactly one target directory.")
    }
  }

  if (directory === undefined) {
    throw new Error("A target directory is required.")
  }

  return { directory, install }
}

async function ensureEmptyDirectory(directory) {
  try {
    const details = await stat(directory)

    if (!details.isDirectory()) {
      throw new Error(`${directory} exists and is not a directory.`)
    }

    const entries = await readdir(directory)

    if (entries.length > 0) {
      throw new Error(`${directory} is not empty.`)
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error
    }

    await mkdir(directory, { recursive: true })
  }
}

async function installDependencies(packageManager, directory) {
  await new Promise((fulfill, reject) => {
    const child = spawn(packageManager, ["install"], {
      cwd: directory,
      stdio: "inherit",
    })

    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (code === 0) {
        fulfill()
      } else {
        reject(
          new Error(
            signal
              ? `${packageManager} install was terminated by ${signal}.`
              : `${packageManager} install exited with code ${code}.`,
          ),
        )
      }
    })
  })
}

export async function createProject(directory, options = {}) {
  const targetDirectory = resolve(options.cwd ?? process.cwd(), directory)
  const name = projectName(targetDirectory)
  const packageManager = options.packageManager ?? detectPackageManager()

  await ensureEmptyDirectory(targetDirectory)
  await cp(templateDirectory, targetDirectory, { recursive: true })
  await rename(
    resolve(targetDirectory, "gitignore"),
    resolve(targetDirectory, ".gitignore"),
  )

  const packageFile = resolve(targetDirectory, "package.json")
  const template = await readFile(packageFile, "utf8")

  await writeFile(
    packageFile,
    template
      .replaceAll("__PACKAGE_NAME__", name)
      .replaceAll("__FLAMEFRONT_VERSION__", packageMetadata.version),
  )

  if (options.install !== false) {
    await (options.installDependencies ?? installDependencies)(
      packageManager,
      targetDirectory,
    )
  }

  return { name, packageManager, targetDirectory }
}

export async function run(arguments_, options = {}) {
  try {
    const parsed = parseArguments(arguments_)

    if (parsed.help) {
      console.log(usage)
      return
    }

    if (parsed.version) {
      console.log(packageMetadata.version)
      return
    }

    const result = await createProject(parsed.directory, {
      cwd: options.cwd,
      install: parsed.install,
      installDependencies: options.installDependencies,
      packageManager: options.packageManager,
    })
    const relativeTarget = parsed.directory === "." ? "." : parsed.directory

    console.log(`Created ${result.name} in ${result.targetDirectory}.`)
    if (!parsed.install) {
      console.log(
        `\nNext steps:\n  cd ${relativeTarget}\n  ${result.packageManager} install\n  ${result.packageManager} run dev`,
      )
    } else {
      console.log(
        `\nNext steps:\n  cd ${relativeTarget}\n  ${result.packageManager} run dev`,
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    console.error(`create-flamefront: ${message}`)
    process.exitCode = 1
  }
}
