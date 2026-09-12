import assert from "node:assert/strict"
import { execFile, spawn } from "node:child_process"
import { createServer } from "node:http"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { chromium } from "playwright"
import { test } from "vitest"

const execFileAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const playground = resolve(root, "playground")
const fixture = resolve(root, "scripts/browser-fixture")
const ff = resolve(playground, "node_modules/.bin/ff")

async function run(command, args, cwd, extraEnv = {}) {
  return execFileAsync(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv, CI: "1" },
    maxBuffer: 20 * 1024 * 1024,
  })
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

function startPreview(port, cwd, token, command = "preview") {
  const child = spawn(ff, [command], {
    cwd,
    env: {
      ...process.env,
      CI: "1",
      FLAMEFRONT_CHECK_TOKEN: token,
      PORT: String(port),
    },
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

async function waitForPreview(server, url, token) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.child.exitCode !== null) {
      throw new Error(`${url} could not start.\n${server.getOutput()}`)
    }

    try {
      const response = await fetch(url)

      if (
        (token === undefined ||
          response.headers.get("x-flamefront-check-token") === token) &&
        response.status < 500
      ) {
        return
      }
    } catch {
      // The preview process is still starting.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }

  throw new Error(`${url} timed out.\n${server.getOutput()}`)
}

async function stopPreview(server) {
  if (!server || server.child.exitCode !== null) {
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

async function waitForText(page, selector, text) {
  await page.waitForFunction(
    ({ selector: elementSelector, text: expectedText }) =>
      document
        .querySelector(elementSelector)
        ?.textContent?.replace(/\s+/g, " ")
        .includes(expectedText) ?? false,
    { selector, text },
  )
}

async function waitForAttribute(page, selector, attribute, value) {
  await page.waitForFunction(
    ({ selector: elementSelector, attribute: name, value: expectedValue }) =>
      document.querySelector(elementSelector)?.getAttribute(name) ===
      expectedValue,
    { selector, attribute, value },
  )
}

async function goto(page, url, status = 200) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" })

  assert.equal(
    response?.status(),
    status,
    `${url} returned an unexpected status.`,
  )
  return response
}

async function clickRoute(page, name, pathname) {
  const location = page.waitForURL((url) => url.pathname === pathname, {
    timeout: 10_000,
  })

  await page.getByRole("link", { name, exact: true }).first().click()
  await location
}

async function checkMainApp(page, base) {
  const fragmentRequests = []

  page.on("request", (request) => {
    if (request.url().includes("__flamefront_fragment=1")) {
      fragmentRequests.push(request.url())
    }
  })

  await goto(page, `${base}/`)
  await waitForText(
    page,
    '[data-testid="home-counter-status"]',
    "Immediate counter: 0",
  )
  await waitForAttribute(
    page,
    '[data-testid="route-facts"] > div',
    "data-hydrated",
    "true",
  )
  await page.waitForTimeout(250)

  await page.getByTestId("home-counter").click()
  await waitForText(
    page,
    '[data-testid="home-counter-status"]',
    "Immediate counter: 1",
  )
  await page.getByTestId("shell-counter").click()
  await waitForText(page, '[data-testid="shell-counter"]', "Shell count 1")

  const navigationEntries = await page.evaluate(
    () => performance.getEntriesByType("navigation").length,
  )

  await clickRoute(page, "About", "/about")
  await waitForText(page, '[data-testid="about-static-proof"]', "complete HTML")
  await waitForText(page, '[data-testid="shell-counter"]', "Shell count 1")
  assert.equal(
    await page.evaluate(
      () => performance.getEntriesByType("navigation").length,
    ),
    navigationEntries,
    "Static navigation performed a document navigation.",
  )
  assert.ok(
    fragmentRequests.some((url) => url.startsWith(`${base}/about?`)),
    "Static navigation did not request a fragment artifact.",
  )

  await page.goBack()
  await page.waitForURL((url) => url.pathname === "/")
  await waitForText(page, '[data-route="/"]', "One graph")
  await waitForText(page, '[data-testid="shell-counter"]', "Shell count 1")

  const loaderRequests = []

  page.on("request", (request) => {
    if (request.url().includes("/__flamefront/data")) {
      loaderRequests.push(request.url())
    }
  })

  await clickRoute(page, "Workspace", "/workspace")
  await waitForText(
    page,
    '[data-route="/workspace"]',
    "Browser fetched loader data",
  )
  assert.ok(
    loaderRequests.some((url) =>
      new URL(url).searchParams.get("url")?.endsWith("/workspace"),
    ),
    "Client navigation did not request loader data.",
  )

  await page.getByTestId("layout-counter").click()
  await waitForText(page, '[data-testid="layout-counter"]', "Layout count 1")
  await clickRoute(page, "Settings", "/workspace/settings")
  await waitForText(
    page,
    '[data-route="/workspace/settings"]',
    "Browser fetched loader data",
  )
  await waitForText(page, '[data-testid="layout-counter"]', "Layout count 1")

  await page.goBack()
  await page.waitForURL((url) => url.pathname === "/workspace")
  await waitForText(page, '[data-route="/workspace"]', "Workspace")
  await page.goForward()
  await page.waitForURL((url) => url.pathname === "/workspace/settings")
  await waitForText(
    page,
    '[data-route="/workspace/settings"]',
    "Workspace settings",
  )

  const errorResponse = await goto(page, `${base}/products/missing`, 404)

  assert.equal(errorResponse?.status(), 404)
}

async function checkBasenameFixture(page, base) {
  const fragmentRequests = []

  page.on("request", (request) => {
    if (request.url().includes("__flamefront_fragment=1")) {
      fragmentRequests.push(request.url())
    }
  })

  await goto(page, `${base}/guide`)
  assert.equal(new URL(page.url()).pathname, "/guide/client")
  await waitForText(
    page,
    '[data-testid="fixture-client"]',
    "Client loader: /guide/client",
  )

  const directError = await goto(page, `${base}/guide/error`, 418)

  assert.equal(directError?.status(), 418)
  await waitForText(page, "h2", "Unexpected Application Error!")
  await waitForText(page, "h3", "418")

  await page.getByTestId("fixture-shell-counter").click()
  await waitForText(
    page,
    '[data-testid="fixture-shell-counter"]',
    "Shell count: 1",
  )

  const navigationEntries = await page.evaluate(
    () => performance.getEntriesByType("navigation").length,
  )

  await clickRoute(page, "Server", "/guide/server")
  await waitForText(
    page,
    '[data-testid="fixture-server-data"]',
    "Server loader: /guide/server default request 1",
  )
  await waitForText(
    page,
    '[data-testid="fixture-shell-counter"]',
    "Shell count: 1",
  )
  await page.getByTestId("fixture-server-counter").click()
  await waitForText(
    page,
    '[data-testid="fixture-server-counter"]',
    "Server count: 1",
  )
  assert.equal(
    await page.evaluate(
      () => performance.getEntriesByType("navigation").length,
    ),
    navigationEntries,
    "Server fragment navigation performed a document navigation.",
  )
  assert.ok(
    fragmentRequests.some((url) => url.startsWith(`${base}/guide/server?`)),
    "Server navigation did not request a fragment response.",
  )

  await clickRoute(page, "Static", "/guide/static")
  await waitForText(
    page,
    '[data-testid="fixture-static"]',
    "Static loader: /guide/static",
  )
  await waitForText(
    page,
    '[data-testid="fixture-shell-counter"]',
    "Shell count: 1",
  )
  assert.ok(
    fragmentRequests.some((url) => url.startsWith(`${base}/guide/static?`)),
    "Basename static navigation did not request its fragment artifact.",
  )

  await clickRoute(page, "Server", "/guide/server")
  await waitForText(
    page,
    '[data-testid="fixture-server-data"]',
    "Server loader: /guide/server default request 2",
  )

  await clickRoute(page, "Static", "/guide/static")
  await clickRoute(page, "Server compact", "/guide/server")
  await waitForText(
    page,
    '[data-testid="fixture-server-data"]',
    "Server loader: /guide/server compact request 3",
  )
  await waitForText(
    page,
    '[data-testid="fixture-server-location"]',
    "Router location: /server?view=compact",
  )

  const actionRequest = page.waitForResponse((response) => {
    const url = new URL(response.url())

    return (
      response.request().method() === "POST" &&
      url.pathname === "/guide/server" &&
      url.searchParams.get("__flamefront_action") === "1"
    )
  })

  await page.getByTestId("fixture-action-redirect").click()
  await page.waitForURL((url) => url.pathname === "/guide/destination")
  assert.equal((await actionRequest).status(), 204)
  await waitForText(
    page,
    '[data-testid="fixture-destination"]',
    "Redirect destination",
  )

  await clickRoute(page, "Server", "/guide/server")

  const errorFragment = page.waitForResponse((response) => {
    const url = new URL(response.url())

    return (
      url.pathname === "/guide/error" &&
      url.searchParams.get("__flamefront_fragment") === "1"
    )
  })

  await clickRoute(page, "Error", "/guide/error")
  assert.equal((await errorFragment).status(), 418)
  await waitForText(
    page,
    '[data-testid="fixture-shell-counter"]',
    "Shell count: 1",
  )

  const redirectFragment = page.waitForResponse((response) => {
    const url = new URL(response.url())

    return (
      url.pathname === "/guide/redirect" &&
      url.searchParams.get("__flamefront_fragment") === "1"
    )
  })

  await clickRoute(page, "Redirect", "/guide/destination")
  assert.equal((await redirectFragment).status(), 302)
  await waitForText(
    page,
    '[data-testid="fixture-destination"]',
    "Redirect destination",
  )
}

async function checkDormantShell(page, base, mode) {
  await goto(page, `${base}/guide/server`)
  await waitForText(
    page,
    '[data-testid="fixture-server-data"]',
    "Server loader: /guide/server default",
  )

  const location = page.waitForURL((url) => url.pathname === "/guide/client", {
    timeout: 10_000,
  })

  await page
    .getByTestId("fixture-server")
    .getByRole("link", { name: "Client", exact: true })
    .click()
  await location
  await waitForText(
    page,
    '[data-testid="fixture-client"]',
    "Client loader: /guide/client",
  )

  // Deferred activation is intentionally driven by this first location
  // change, so the shell must see the current client location immediately.
  if (mode === "none") {
    await waitForText(
      page,
      '[data-testid="fixture-path"]',
      "Shell path: /server",
    )
    await page.getByTestId("fixture-shell-counter").click()
    await page.waitForTimeout(100)
    assert.equal(
      (await page.getByTestId("fixture-shell-counter").textContent())
        ?.replace(/\s+/g, " ")
        .trim(),
      "Shell count: 0",
      "An inert shell responded to an event.",
    )
    return
  }

  await waitForText(page, '[data-testid="fixture-path"]', "Shell path: /client")
  await page.getByTestId("fixture-shell-counter").click()
  await waitForText(
    page,
    '[data-testid="fixture-shell-counter"]',
    "Shell count: 1",
  )
}

async function checkDocument(page, base) {
  const errors = []
  const onError = (error) => errors.push(String(error))

  page.on("pageerror", onError)
  for (const route of ["server", "static", "client"]) {
    const response = await page.goto(`${base}/guide/${route}`)
    const html = await response.text()

    assert.match(html, /^<!doctype html>/i)
    assert.equal((html.match(/<html\b/g) ?? []).length, 1)
    assert.equal((html.match(/<head\b/g) ?? []).length, 1)
    assert.equal((html.match(/<body\b/g) ?? []).length, 1)
    assert.equal(
      (html.match(/id="flamefront-static-router-hydration"/g) ?? []).length,
      1,
    )
    await page.waitForFunction(() => document.documentElement.lang === "en")
    await page
      .waitForFunction(() => window.__fixtureHydrated === true)
      .catch((error) => {
        throw new Error(
          `Client startup failed at ${page.url()}: ${errors.join("\n")}`,
          { cause: error },
        )
      })
    assert.equal(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--document-fixture-ready")
          .trim(),
      ),
      "1",
    )
    const scripts = await page
      .locator('script[type="module"][data-flamefront-asset]')
      .count()

    assert.ok(scripts > 0)
    await page.getByTestId("document-language").click()
    await page.waitForFunction(() => document.documentElement.lang === "fr")
    await page.evaluate(() => {
      window.__documentElement = document.documentElement
    })
    await page
      .getByRole("navigation", { name: "Fixture routes" })
      .getByRole("link", { name: "Client", exact: true })
      .click()
    await page.waitForFunction(
      () => document.documentElement.getAttribute("data-path") === "/client",
    )
    assert.equal(await page.locator("html").getAttribute("lang"), "fr")
    assert.equal(
      await page.evaluate(
        () => window.__documentElement === document.documentElement,
      ),
      true,
    )
    assert.equal(
      await page
        .locator('script[type="module"][data-flamefront-asset]')
        .count(),
      scripts,
    )
  }

  page.off("pageerror", onError)
  assert.deepEqual(errors, [])
}

test("covers browser navigation, hydration, and history", async () => {
  await run(ff, ["build"], fixture)

  const rootPort = await findPort()
  const rootToken = `browser-test-root-${process.pid}-${Date.now()}`
  const rootServer = startPreview(rootPort, playground, rootToken)
  let fixtureServer
  let browser

  try {
    browser = await chromium.launch({ headless: true })
    await waitForPreview(rootServer, `http://127.0.0.1:${rootPort}/`, rootToken)

    const mainPage = await browser.newPage()
    const fixturePage = await browser.newPage()

    const fixturePort = await findPort()
    const fixtureToken = `browser-test-fixture-${process.pid}-${Date.now()}`

    fixtureServer = startPreview(fixturePort, fixture, fixtureToken)
    await waitForPreview(
      fixtureServer,
      `http://127.0.0.1:${fixturePort}/guide/client`,
      fixtureToken,
    )

    await checkMainApp(mainPage, `http://127.0.0.1:${rootPort}`)
    await checkBasenameFixture(fixturePage, `http://127.0.0.1:${fixturePort}`)
    await checkDocument(fixturePage, `http://127.0.0.1:${fixturePort}`)

    await mainPage.close()
    await fixturePage.close()
    await stopPreview(fixtureServer)

    const devPort = await findPort()
    const devToken = `browser-test-dev-${process.pid}-${Date.now()}`

    fixtureServer = startPreview(devPort, fixture, devToken, "dev")
    await waitForPreview(
      fixtureServer,
      `http://127.0.0.1:${devPort}/guide/server`,
      undefined,
    )
    const devPage = await browser.newPage()

    await checkDocument(devPage, `http://127.0.0.1:${devPort}`)
    await devPage.close()
    await stopPreview(fixtureServer)

    for (const shellHydration of ["none", "deferred"]) {
      await run(ff, ["build"], fixture, {
        VITE_SHELL_HYDRATION: shellHydration,
      })
      const dormantPort = await findPort()
      const dormantToken = `browser-test-${shellHydration}-${process.pid}-${Date.now()}`

      fixtureServer = startPreview(dormantPort, fixture, dormantToken)
      await waitForPreview(
        fixtureServer,
        `http://127.0.0.1:${dormantPort}/guide/client`,
        dormantToken,
      )
      const dormantPage = await browser.newPage()

      await checkDormantShell(
        dormantPage,
        `http://127.0.0.1:${dormantPort}`,
        shellHydration,
      )
      await dormantPage.close()
      await stopPreview(fixtureServer)
    }
  } finally {
    await browser?.close()
    await Promise.all([stopPreview(rootServer), stopPreview(fixtureServer)])
  }

  console.log(
    "Browser acceptance passed for hydration, client and fragment navigation, loaders, errors, redirects, basenames, and history.",
  )
})
