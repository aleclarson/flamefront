import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { chromium } from "playwright"

const port = 4187
const preview = spawn("pnpm", ["exec", "ff", "preview"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "inherit"],
})

try {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Preview did not start")),
      15_000,
    )
    preview.stdout.on("data", (chunk) => {
      if (String(chunk).includes(`localhost:${port}`)) {
        clearTimeout(timeout)
        resolve()
      }
    })
    preview.on("exit", (code) =>
      reject(new Error(`Preview exited with ${code}`)),
    )
  })

  const base = `http://localhost:${port}`
  const docs = await fetch(`${base}/docs/create-app`)
  assert.equal(docs.status, 200)
  assert.match(await docs.text(), /Create a one-page app/)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(base)
  await page.getByRole("link", { name: "Play" }).click()
  await page.getByText("Octane compiled this source successfully.").waitFor()
  await page.getByRole("button", { name: /Turn the shape/ }).click()
  await assert.doesNotReject(() =>
    page.getByText("Turn the shape 12°").waitFor(),
  )

  const noScript = await browser.newContext({ javaScriptEnabled: false })
  const forumPage = await noScript.newPage()
  await forumPage.goto(`${base}/forum`)
  const topic = `Browser test ${Date.now()}`
  await forumPage.getByLabel("Title").fill(topic)
  await forumPage
    .getByLabel("Message")
    .fill("This topic verifies the server action and Turso-compatible store.")
  await forumPage.getByRole("button", { name: "Post topic" }).click()
  try {
    await forumPage.getByRole("heading", { name: topic }).waitFor()
  } catch (error) {
    throw new Error(
      `Forum submission stopped at ${forumPage.url()}: ${(await forumPage.locator("body").innerText()).slice(0, 500)}`,
      { cause: error },
    )
  }
  await noScript.close()
  await browser.close()
} finally {
  preview.kill("SIGTERM")
}
