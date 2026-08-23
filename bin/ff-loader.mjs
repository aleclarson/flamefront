import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"

const extensions = [".cts", ".mts", ".ts", ".tsx"]

export async function load(url, context, nextLoad) {
  if (!extensions.some((extension) => url.endsWith(extension))) {
    return nextLoad(url, context)
  }

  const source = await readFile(new URL(url), "utf8")

  return {
    format: "module",
    shortCircuit: true,
    source: stripTypeScriptTypes(source, { mode: "strip" }),
  }
}
