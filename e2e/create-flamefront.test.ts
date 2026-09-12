import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { test } from "vitest"

const execFileAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

async function run(command: string, args: string[], cwd: string) {
  try {
    return await execFileAsync(command, args, {
      cwd,
      env: { ...process.env, CI: "1" },
      maxBuffer: 20 * 1024 * 1024,
    })
  } catch (error) {
    const failure = error as Error & { stderr?: string; stdout?: string }
    const output = [failure.stdout, failure.stderr].filter(Boolean).join("\n")

    throw new Error(`${failure.message}\n${output}`, { cause: error })
  }
}

test("the packed creator produces an installable app", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "create-flamefront-e2e-"))

  try {
    await run(
      "pnpm",
      ["--filter", "flamefront", "pack", "--pack-destination", workspace],
      root,
    )
    await run(
      "pnpm",
      [
        "--filter",
        "create-flamefront",
        "pack",
        "--pack-destination",
        workspace,
      ],
      root,
    )

    const archives = await readdir(workspace)
    const flamefrontArchive = resolve(
      workspace,
      archives.find((name) => /^flamefront-/.test(name))!,
    )
    const creatorArchive = resolve(
      workspace,
      archives.find((name) => /^create-flamefront-/.test(name))!,
    )
    const extractedCreator = resolve(workspace, "creator")

    await mkdir(extractedCreator)
    await run("tar", ["-xzf", creatorArchive, "-C", extractedCreator], root)
    await run(
      "node",
      [
        resolve(extractedCreator, "package/bin/create-flamefront.js"),
        "app",
        "--no-install",
      ],
      workspace,
    )

    const app = resolve(workspace, "app")
    const packageFile = resolve(app, "package.json")
    const metadata = JSON.parse(await readFile(packageFile, "utf8"))

    metadata.dependencies.flamefront = `file:${flamefrontArchive}`
    await writeFile(packageFile, `${JSON.stringify(metadata, null, 2)}\n`)

    await run("pnpm", ["install", "--no-lockfile", "--prefer-offline"], app)
    await run("pnpm", ["typegen"], app)
    await run("pnpm", ["typecheck"], app)
    await run("pnpm", ["build"], app)

    await stat(resolve(app, "dist/client/index.html"))
    await stat(resolve(app, "dist/server/server.js"))
    assert.match(
      await readFile(resolve(app, "dist/client/index.html"), "utf8"),
      /<div id="root"><\/div>/,
    )
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
