import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "../..")
const source = resolve(root, "docs")
const destination = resolve(root, "website/src/docs")

await mkdir(destination, { recursive: true })
await mkdir(resolve(root, "website/.data"), { recursive: true })
await Promise.all(
  (await readdir(destination)).map((file) => rm(resolve(destination, file))),
)
const files = (await readdir(source)).filter((file) => file.endsWith(".md"))
for (const file of files) {
  const markdown = await readFile(resolve(source, file), "utf8")
  await writeFile(
    resolve(destination, file),
    markdown.replace(/\(([^)]+)\.md(#[^)]+)?\)/g, "($1$2)"),
  )
}

const indexPath = resolve(destination, "index.md")
const index = await readFile(indexPath, "utf8")
await writeFile(
  indexPath,
  index
    .replace(/^# .+$/m, "# Documentation")
    .replace(
      /^>.*\n(?:>.*\n)*/m,
      "> Build a complete Octane application with Flamefront.\n",
    ),
)
