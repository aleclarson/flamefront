import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

/** Vite still processes an HTML entry to discover and hash client assets. */
export async function readProjectTemplate(
  root: string,
  hasDocument: boolean,
): Promise<string> {
  try {
    return await readFile(resolve(root, "index.html"), "utf8")
  } catch (error) {
    if (!hasDocument || (error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }

    return '<!doctype html><html><head></head><body><script type="module" src="/src/main.ts"></script></body></html>'
  }
}

// Vite's evaluated SSR modules do not share the plugin's module cache. Keep
// development-only callbacks scoped by project, and release them on close.
export const devTemplateLoadersKey = "flamefront:dev-template-loaders"
