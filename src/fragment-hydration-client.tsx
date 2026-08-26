import { hydrateRoot, setDangerouslySetInnerHTML, setHTML } from "octane"

type RenderableComponent = (props: Record<string, unknown>) => unknown

/** Transfer inserted fragment DOM from the outer root to a nested Octane root. */
export function hydrateRouteFragment(
  host: HTMLDivElement,
  Component: RenderableComponent,
): { unmount(): void } {
  const html = host.innerHTML

  setDangerouslySetInnerHTML(host, null)
  setHTML(host, html)

  return hydrateRoot(host, <Component />)
}
