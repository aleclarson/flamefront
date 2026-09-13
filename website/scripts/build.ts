import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const startedAt = new Date().toISOString()
const command = spawn(
  "pnpm",
  ["exec", "ff", "build", ...process.argv.slice(2)],
  {
    cwd: resolve(import.meta.dirname, ".."),
    stdio: ["inherit", "pipe", "inherit"],
  },
)
let output = ""

command.stdout.on("data", (chunk) => {
  output += chunk
  process.stdout.write(chunk)
})
const exitCode = await new Promise<number>((resolveCode) =>
  command.on("close", resolveCode),
)

if (exitCode !== 0) {
  process.exit(exitCode)
}

const match = output.match(
  /Prerendered (\d+) pages?, reused (\d+) cached pages?\./,
)
const report = {
  startedAt,
  revision:
    process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local",
  rendered: Number(match?.[1] ?? 0),
  reused: Number(match?.[2] ?? 0),
}
const reportDirectory = resolve(import.meta.dirname, "../dist/client/build")

await mkdir(reportDirectory, { recursive: true })
await writeFile(
  resolve(reportDirectory, "index.json"),
  JSON.stringify(report, null, 2),
)
