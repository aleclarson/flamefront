import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { javascript } from "@codemirror/lang-javascript"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import { useEffect, useRef } from "octane"

type Props = { value: string; onChange(value: string): void }

export function CodeEditor({ value, onChange }: Props) @{
  const host = useRef<HTMLDivElement | null>(null)
  const handler = useRef(onChange)
  handler.current = onChange
  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          javascript({ typescript: true, jsx: true }),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) handler.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    return () => view.destroy()
  }, [])
  <div class="editor-host" ref={host} aria-label="Octane example editor"></div>
}
