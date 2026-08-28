import { RouterProvider } from "@octanejs/remix-router/dom"
import { createElement } from "octane"
import { routeOutletHtmlContext } from "./fragment.tsx"
import type {
  RouterDocument as RouterDocumentComponent,
  RouterDocumentProps,
} from "./octane.tsx"

/** Canonical router root shared by Flamefront's Octane server and client. */
export const RouterDocument: RouterDocumentComponent = (
  props: RouterDocumentProps,
) => {
  const Router = RouterProvider as unknown as (props: {
    readonly router: unknown
  }) => unknown

  return createElement(
    routeOutletHtmlContext.Provider,
    { value: props.outletHtml ?? null },
    createElement(Router, { router: props.router }),
  )
}
