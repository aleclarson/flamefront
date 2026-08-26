import assert from "node:assert/strict"
import { execFile, spawn } from "node:child_process"
import {
  cp,
  copyFile,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
} from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { test } from "vitest"

const execFileAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const fixture = resolve(root, "scripts/consumer-fixture")

async function run(command, args, cwd) {
  try {
    return await execFileAsync(command, args, {
      cwd,
      env: { ...process.env, CI: "1" },
      maxBuffer: 20 * 1024 * 1024,
    })
  } catch (error) {
    const failure = error
    const output = [failure.stdout, failure.stderr].filter(Boolean).join("\n")

    throw new Error(`${failure.message}\n${output}`, { cause: error })
  }
}

async function collectFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    const entryPrefix = join(prefix, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath, entryPrefix)))
    } else {
      files.push(entryPrefix.split("\\").join("/"))
    }
  }

  return files
}

async function findPort() {
  const server = createServer()

  await new Promise((resolvePromise, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolvePromise)
  })

  const address = server.address()

  assert.ok(address && typeof address === "object")
  const port = address.port

  await new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()))
  })

  return port
}

function startServer(command, args, cwd, port) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, CI: "1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""

  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  child.stdout.on("data", (chunk) => {
    output += chunk
  })
  child.stderr.on("data", (chunk) => {
    output += chunk
  })

  const exited = new Promise((resolvePromise) => {
    child.once("exit", (code, signal) => resolvePromise({ code, signal }))
  })

  return { child, exited, getOutput: () => output }
}

async function waitForResponse(server, url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.child.exitCode !== null) {
      throw new Error(`${url} could not start.\n${server.getOutput()}`)
    }

    try {
      return await fetch(url)
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
    }
  }

  throw new Error(`${url} timed out.\n${server.getOutput()}`)
}

async function stopServer(server) {
  if (server.child.exitCode !== null) {
    return
  }

  server.child.kill("SIGTERM")
  let timeout
  const timedOut = new Promise((resolvePromise) => {
    timeout = setTimeout(() => resolvePromise(null), 5_000)
  })
  const result = await Promise.race([server.exited, timedOut])

  clearTimeout(timeout)

  if (result === null && server.child.exitCode === null) {
    server.child.kill("SIGKILL")
    await server.exited
  }
}

async function assertFile(path) {
  await stat(path)
}

test("packs Flamefront and runs it from a clean consumer", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "flamefront-consumer-"))
  const consumer = resolve(workspace, "app")

  try {
    await cp(fixture, consumer, { recursive: true })

    await run(
      "pnpm",
      ["--filter", "flamefront", "pack", "--pack-destination", workspace],
      root,
    )

    const archives = (await readdir(workspace)).filter((name) =>
      name.endsWith(".tgz"),
    )

    assert.deepEqual(archives.length, 1)
    const archive = resolve(workspace, archives[0])
    const archiveInConsumer = resolve(consumer, "flamefront.tgz")

    await copyFile(archive, archiveInConsumer)

    const archiveListing = (await run("tar", ["-tzf", archive], root)).stdout
      .trim()
      .split("\n")
      .map((entry) => entry.replace(/\/$/, ""))
      .sort()
    const packageFiles = [
      ...(await collectFiles(resolve(root, "flamefront/bin"))).map(
        (file) => `package/bin/${file}`,
      ),
      ...(await collectFiles(resolve(root, "flamefront/src"))).map(
        (file) => `package/src/${file}`,
      ),
    ]
    const expectedListing = [
      "package/LICENSE.md",
      "package/README.md",
      "package/package.json",
      ...packageFiles,
    ].sort()

    assert.deepEqual(archiveListing, expectedListing)

    await run(
      "pnpm",
      ["install", "--no-lockfile", "--prefer-offline"],
      consumer,
    )

    const installedPackage = await realpath(
      resolve(consumer, "node_modules/flamefront"),
    )

    assert.notEqual(installedPackage, resolve(root, "flamefront"))

    const installedManifest = JSON.parse(
      await readFile(resolve(installedPackage, "package.json"), "utf8"),
    )

    assert.equal(installedManifest.version, "0.1.0-alpha.0")
    assert.equal(installedManifest.private, false)
    assert.equal(installedManifest.bin.ff, "./bin/ff.js")
    assert.equal(installedManifest.engines.node, ">=22.22.2")

    const ff = resolve(consumer, "node_modules/.bin/ff")
    const version = await run(ff, ["--version"], consumer)

    assert.equal(version.stdout.trim(), "0.1.0-alpha.0")

    await run(ff, ["typegen"], consumer)
    await run("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], consumer)

    const routes = JSON.parse(
      (await run(ff, ["routes", "--json"], consumer)).stdout,
    )

    assert.deepEqual(
      routes.map(({ path, render }) => ({ path, render })),
      [
        { path: "/", render: "server" },
        { path: "/about", render: "static" },
      ],
    )

    const devPort = await findPort()
    const dev = startServer(ff, ["dev"], consumer, devPort)

    try {
      const response = await waitForResponse(
        dev,
        `http://127.0.0.1:${devPort}/`,
      )

      assert.equal(response.status, 200)
      const html = await response.text()

      assert.match(html, /data-testid="consumer-home"/)
      assert.match(html, /Consumer loader:/)
    } finally {
      await stopServer(dev)
    }

    await run(ff, ["build"], consumer)
    await assertFile(resolve(consumer, "dist/client/index.html"))
    await assertFile(resolve(consumer, "dist/server/server.js"))
    await assertFile(resolve(consumer, "dist/client/about/index.html"))

    const previewPort = await findPort()
    const preview = startServer(ff, ["preview"], consumer, previewPort)

    try {
      const base = `http://127.0.0.1:${previewPort}`
      const homeResponse = await waitForResponse(preview, `${base}/`)

      assert.equal(homeResponse.status, 200)
      assert.match(await homeResponse.text(), /data-testid="consumer-home"/)

      const aboutResponse = await waitForResponse(preview, `${base}/about`)

      assert.equal(aboutResponse.status, 200)
      assert.match(await aboutResponse.text(), /data-testid="consumer-about"/)

      const dataUrl = new URL(`${base}/__flamefront/data`)

      dataUrl.searchParams.set("url", `${base}/`)
      const dataResponse = await fetch(dataUrl)

      assert.equal(dataResponse.status, 200)
      assert.deepEqual(await dataResponse.json(), { pathname: "/" })
    } finally {
      await stopServer(preview)
    }
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }

  console.log("Packed Flamefront alpha passed the clean consumer check.")
})
