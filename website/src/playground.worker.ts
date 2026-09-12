import { compile } from "octane/compiler"

type Request = { revision: number; source: string }

self.onmessage = ({ data }: MessageEvent<Request>) => {
  try {
    const result = compile(data.source, "Toy.tsrx", {
      mode: "client",
      dev: true,
    })
    const diagnostics = result.diagnostics.filter(
      (item) => item.severity === "error",
    )
    self.postMessage({
      revision: data.revision,
      ok: diagnostics.length === 0,
      diagnostics,
    })
  } catch (error) {
    self.postMessage({
      revision: data.revision,
      ok: false,
      diagnostics: [
        { message: error instanceof Error ? error.message : String(error) },
      ],
    })
  }
}
