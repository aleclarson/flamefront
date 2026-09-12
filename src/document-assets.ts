/** Internal, serializable description of a framework-owned document asset. */
export interface DocumentAsset {
  readonly tag: "link" | "style" | "script"
  readonly attributes: Readonly<Record<string, string>>
  readonly content?: string
}

export interface DocumentAssets {
  readonly head: readonly DocumentAsset[]
  readonly scripts: readonly DocumentAsset[]
}

export const documentAssetAttribute = "data-flamefront-asset"

function decodeAttribute(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi,
    (entity, name: string) => {
      if (name[0] === "#") {
        const code =
          name[1].toLowerCase() === "x"
            ? parseInt(name.slice(2), 16)
            : Number(name.slice(1))

        return code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : "\ufffd"
      }

      return (
        (
          { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" } as Record<
            string,
            string
          >
        )[name.toLowerCase()] ?? entity
      )
    },
  )
}

/** Extract only asset tags; document metadata belongs to the document component. */
export function documentAssets(
  template: string,
  hydrationScript: string,
): DocumentAssets {
  const head: DocumentAsset[] = []
  const scripts: DocumentAsset[] = []
  // Consume comments and raw-text elements as units so their contents cannot
  // masquerade as asset tags. Quoted attribute values may contain angle brackets.
  const tags =
    /<!--[\s\S]*?-->|<(script|style|title|textarea|template|link)\b((?:[^>"']|"[^"]*"|'[^']*')*)>(?:([\s\S]*?)<\/\1\s*>)?/gi

  for (const match of `${template}${hydrationScript}`.matchAll(tags)) {
    const tag = match[1]?.toLowerCase()

    if (tag !== "script" && tag !== "style" && tag !== "link") {
      continue
    }

    const attributes: Record<string, string> = {}

    for (const attribute of match[2].matchAll(
      /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
    )) {
      attributes[attribute[1].toLowerCase()] = decodeAttribute(
        attribute[2] ?? attribute[3] ?? attribute[4] ?? "",
      )
    }

    attributes[documentAssetAttribute] = tag === "script" ? "scripts" : "head"
    const asset: DocumentAsset = {
      tag,
      attributes,
      ...(tag === "link" ? {} : { content: match[3] ?? "" }),
    }

    ;(tag === "script" ? scripts : head).push(asset)
  }

  return { head, scripts }
}

/** Snapshot server assets before hydration; no scripts are re-executed. */
export function readDocumentAssets(document: Document): DocumentAssets {
  const read = (slot: string): DocumentAsset[] =>
    Array.from(
      document.querySelectorAll(`[${documentAssetAttribute}="${slot}"]`),
      (element) => ({
        tag: element.localName as DocumentAsset["tag"],
        attributes: Object.fromEntries(
          Array.from(element.attributes, ({ name, value }) => [
            name,
            name === "nonce"
              ? ((element as HTMLElement).nonce ?? value)
              : value,
          ]),
        ),
        ...(element.localName === "link"
          ? {}
          : { content: element.textContent ?? "" }),
      }),
    )

  return { head: read("head"), scripts: read("scripts") }
}
