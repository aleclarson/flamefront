import { useEffect, useRef, useState } from "octane"
import { CodeEditor } from "./CodeEditor.tsrx"

const initialSource = `import { useState } from "octane"

export default function Toy() @{
  const [turns, setTurns] = useState(0)
  <button onClick={() => setTurns(turns + 1)}>
    Turn the shape {turns * 12} degrees
  </button>
}`

export default function PlaygroundPage() @{
  const [source, setSource] = useState(initialSource)
  const [rotation, setRotation] = useState(0)
  const [status, setStatus] = useState("Compiling in a web worker…")
  const revision = useRef(0)
  const worker = useRef<Worker | null>(null)

  useEffect(() => {
    const compiler = new Worker(new URL("./playground.worker.ts", import.meta.url), {
      type: "module",
    })
    compiler.onmessage = ({ data }) => {
      if (data.revision !== revision.current) return
      setStatus(
        data.ok
          ? "Octane compiled this source successfully."
          : data.diagnostics[0]?.message ?? "Compilation failed.",
      )
    }
    worker.current = compiler
    return () => compiler.terminate()
  }, [])

  useEffect(() => {
    const next = ++revision.current
    setStatus("Compiling in a web worker…")
    const timer = setTimeout(
      () => worker.current?.postMessage({ revision: next, source }),
      180,
    )
    return () => clearTimeout(timer)
  }, [source])

  <main class="page stack">
    <section class="measure">
      <p class="eyebrow">Client rendered</p>
      <h1>Play with Octane</h1>
      <p class="muted">
        Edit a real TSRX component. Octane compiles it away from the main
        thread; the small preview remains isolated from the site.
      </p>
    </section>
    <div class="cluster">
      <button type="button" onClick={() => setSource(initialSource)}>
        Reset source
      </button>
      <span class="muted" role="status">{status}</span>
    </div>
    <section class="playground">
      <CodeEditor value={source} onChange={setSource} />
      <div class="preview" aria-label="Preview">
        <div class="toy-card">
          <button
            type="button"
            onClick={() => setRotation(rotation + 12)}
          >Turn the shape {rotation}°</button>
          <div
            class="toy-shape"
            style={{ "--rotation": `${rotation}deg` }}
          ></div>
        </div>
      </div>
    </section>
    <p class="muted">
      The preview demonstrates the example's interaction while browser execution
      of arbitrary compiled modules remains intentionally disabled.
    </p>
  </main>
}
