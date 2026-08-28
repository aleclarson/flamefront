import {
  StaticRouterProvider,
  type RouteObject,
  createStaticRouter,
  type DataRouter,
  type StaticHandlerContext,
} from "@octanejs/remix-router"
import { renderToString } from "octane/server"
import { routeFragmentBoundaryTarget } from "./fragment.tsx"
import { RouterDocument } from "./octane-router-document.ts"
import type { OctaneRenderer } from "./octane.tsx"

function findRoute(
  routes: readonly RouteObject[],
  id: string,
): RouteObject | undefined {
  for (const route of routes) {
    if (route.id === id) {
      return route
    }

    const match = route.children ? findRoute(route.children, id) : undefined

    if (match) {
      return match
    }
  }

  return undefined
}

function errorsForBoundary(
  context: StaticHandlerContext,
  matches: readonly { readonly route: { readonly id: string } }[],
): StaticHandlerContext["errors"] {
  if (!context.errors) {
    return null
  }

  const ids = new Set(matches.map((match) => match.route.id))
  const errors: Record<string, unknown> = {}
  let inheritedError: unknown = undefined

  for (const [id, error] of Object.entries(context.errors)) {
    if (ids.has(id)) {
      errors[id] = error
    } else if (inheritedError === undefined) {
      inheritedError = error
    }
  }

  if (inheritedError !== undefined && matches[0]) {
    errors[matches[0].route.id] ??= inheritedError
  }

  return Object.keys(errors).length > 0 ? errors : null
}

export const defaultOctaneRenderer: OctaneRenderer = {
  createStaticRouter: (routes, context) =>
    createStaticRouter(
      routes as RouteObject[],
      context as StaticHandlerContext,
    ),
  renderToString: (component, props, options) =>
    renderToString(
      component as Parameters<typeof renderToString>[0],
      props,
      options,
    ),
  renderRouteFragment: (router, context, boundary, options) => {
    const dataRouter = router as DataRouter
    const staticContext = context as StaticHandlerContext
    const state = dataRouter.state
    const matchIndex = state.matches.findIndex(
      (match) => match.route?.id === boundary,
    )

    if (matchIndex < 0) {
      throw new Error(
        `No server router match exists for fragment boundary ${JSON.stringify(boundary)}.`,
      )
    }

    const outletRoute = findRoute(dataRouter.routes, boundary)

    if (!outletRoute) {
      throw new Error(
        `No server route exists for fragment boundary ${JSON.stringify(boundary)}.`,
      )
    }

    const matches = staticContext.matches.slice(matchIndex)
    const outletContext = {
      ...staticContext,
      matches,
      errors: errorsForBoundary(staticContext, matches),
    }
    const outletRouter = createStaticRouter([outletRoute], outletContext)
    const FragmentBoundaryProvider = routeFragmentBoundaryTarget.Provider
    const FragmentRoot = () => (
      <FragmentBoundaryProvider
        value={options?.includeBoundary ? null : boundary}
      >
        <StaticRouterProvider
          router={outletRouter}
          context={outletContext}
          hydrate={false}
        />
      </FragmentBoundaryProvider>
    )

    return renderToString(
      FragmentRoot,
      {},
      {
        ...(options?.identifierPrefix
          ? { identifierPrefix: options.identifierPrefix }
          : {}),
      },
    )
  },
  defaultRouterDocument: RouterDocument,
}
