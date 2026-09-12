import assert from "node:assert/strict"
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, test } from "vitest"
import {
  createProject,
  detectPackageManager,
  projectName,
} from "../packages/create-flamefront/src/cli.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  )
})

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "create-flamefront-"))

  temporaryDirectories.push(directory)
  return directory
}

test("detects supported package managers", () => {
  assert.equal(
    detectPackageManager({
      npm_config_user_agent: "pnpm/11.0.0 npm/? node/v26",
    }),
    "pnpm",
  )
  assert.equal(
    detectPackageManager({
      npm_config_user_agent: "yarn/4.0.0 npm/? node/v26",
    }),
    "yarn",
  )
  assert.equal(detectPackageManager({}), "npm")
})

test("validates the target package name", () => {
  assert.equal(projectName("./my-app"), "my-app")
  assert.throws(() => projectName("./My App"), /not a valid package name/)
})

test("creates the canonical starter without installing", async () => {
  const cwd = await temporaryDirectory()
  const creatorMetadata = JSON.parse(
    await readFile(
      join(process.cwd(), "packages/create-flamefront/package.json"),
      "utf8",
    ),
  )
  const result = await createProject("my-app", {
    cwd,
    install: false,
    packageManager: "pnpm",
  })

  assert.equal(result.name, "my-app")
  assert.deepEqual(
    (await readdir(join(cwd, "my-app", "src"))).sort(),
    [
      "AppShell.tsrx",
      "HomePage.tsrx",
      "app.ts",
      "entry-server.ts",
      "env.d.ts",
      "main.ts",
      "styles.css",
    ].sort(),
  )

  const metadata = JSON.parse(
    await readFile(join(cwd, "my-app", "package.json"), "utf8"),
  )

  assert.equal(metadata.name, "my-app")
  assert.equal(metadata.dependencies.flamefront, `^${creatorMetadata.version}`)
  assert.equal(
    await readFile(join(cwd, "my-app", ".gitignore"), "utf8"),
    ".flamefront/\ndist/\nnode_modules/\n",
  )
})

test("refuses to write into a non-empty directory", async () => {
  const cwd = await temporaryDirectory()
  const target = join(cwd, "existing")

  await mkdir(target)
  await writeFile(join(target, "keep.txt"), "user work")

  await assert.rejects(
    createProject(target, { install: false }),
    /is not empty/,
  )
  assert.equal(await readFile(join(target, "keep.txt"), "utf8"), "user work")
})

test("uses the detected package manager to install", async () => {
  const cwd = await temporaryDirectory()
  let invocation

  await createProject("my-app", {
    cwd,
    installDependencies(packageManager, directory) {
      invocation = { directory, packageManager }
    },
    packageManager: "bun",
  })

  assert.deepEqual(invocation, {
    directory: join(cwd, "my-app"),
    packageManager: "bun",
  })
})
