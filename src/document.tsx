import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "octane"
import type { DocumentAsset, DocumentAssets } from "./document-assets.ts"

/** Props supplied to the optional app document component. */
export interface DocumentProps {
  /** The persistent shell and matched route, already inside router context. */
  readonly children?: ReactNode
}

/** @internal Framework assets shared by server rendering and hydration. */
export const documentAssetsContext = createContext<DocumentAssets | null>(null)

function renderAssets(assets: readonly DocumentAsset[]) {
  return assets.map(({ tag, attributes, content }) =>
    createElement(tag, {
      ...attributes,
      ...(content === undefined
        ? {}
        : { dangerouslySetInnerHTML: { __html: content } }),
    }),
  )
}

/** Render Vite styles and asset links. Place once inside the document's head. */
export function Head() {
  const assets = useContext(documentAssetsContext)

  if (!assets) {
    throw new Error("Head must be rendered inside a Flamefront document.")
  }

  return renderAssets(assets.head)
}

/** Render hydration data and client scripts. Place once at the end of body. */
export function Scripts() {
  const assets = useContext(documentAssetsContext)

  if (!assets) {
    throw new Error("Scripts must be rendered inside a Flamefront document.")
  }

  return renderAssets(assets.scripts)
}

/** @internal Keep the document outside independently hydrated shell boundaries. */
export function createDocumentShell(
  Document: (props: DocumentProps) => unknown,
  Shell: (props: Record<string, unknown>) => unknown,
) {
  return (props: Record<string, unknown>) => {
    const assets = useContext(documentAssetsContext)

    // Fragment renders use a separate router root and return only the shell.
    return assets ? (
      <Document>
        <Shell {...props} />
      </Document>
    ) : (
      <Shell {...props} />
    )
  }
}
