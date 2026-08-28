import {
  createRoot,
  hydrateRoot,
  setDangerouslySetInnerHTML,
  setHTML,
} from "octane"
import { outletIdentifierPrefix } from "./identifier-prefix.ts"

type RenderableComponent = (props: Record<string, unknown>) => unknown

interface OutletRoot {
  unmount(): void
  render(Component: RenderableComponent, props?: Record<string, unknown>): void
}

function removeHostChildRange(html: string): string {
  const start = "<!--[-->"
  const end = "<!--]-->"

  return html.startsWith(start) && html.endsWith(end)
    ? html.slice(start.length, -end.length)
    : html
}

function createOutletRoot(root: ReturnType<typeof createRoot>): OutletRoot {
  return {
    unmount: () => root.unmount(),
    render: (nextComponent, props) => {
      root.render(nextComponent, props)
    },
  }
}

/** Transfer inserted fragment DOM from the outer root to a nested Octane root. */
export function hydrateRouteFragment(
  host: HTMLDivElement,
  Component: RenderableComponent,
): OutletRoot {
  const html = host.innerHTML

  setDangerouslySetInnerHTML(host, null)
  setHTML(host, html)

  const root = hydrateRoot(host, Component, undefined, {
    identifierPrefix: outletIdentifierPrefix,
  })

  return {
    unmount: () => root.unmount(),
    render: (nextComponent) => root.render(nextComponent),
  }
}

/** Mount a routed outlet into its own root after the outer shell commits. */
export function renderRouteOutlet(
  host: HTMLDivElement,
  Component: RenderableComponent,
  hydrate: boolean,
): OutletRoot {
  if (hydrate) {
    const html = removeHostChildRange(host.innerHTML)

    setDangerouslySetInnerHTML(host, null)
    setHTML(host, html)

    const root = hydrateRoot(host, Component, undefined, {
      identifierPrefix: outletIdentifierPrefix,
    })

    return createOutletRoot(root)
  }

  setDangerouslySetInnerHTML(host, null)
  setHTML(host, "")

  const root = createRoot(host, { identifierPrefix: outletIdentifierPrefix })

  root.render(Component)

  return createOutletRoot(root)
}
