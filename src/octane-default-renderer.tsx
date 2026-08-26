import {
  StaticRouter,
  UNSAFE_DataRouterContext,
  UNSAFE_DataRouterStateContext,
  UNSAFE_FetchersContext,
  UNSAFE_ViewTransitionContext,
  createStaticRouter,
  renderMatches,
  type DataRouter,
  type Navigator,
  type RouteObject,
  type StaticHandlerContext,
} from "@octanejs/remix-router"
import { renderToString } from "octane/server"
import { routeFragmentBoundaryTarget } from "./fragment.tsx"
import { RouterDocument } from "./octane-router-document.ts"
import type { OctaneRenderer } from "./octane.tsx"

type StaticNavigator = Navigator & {
  back(): never
  forward(): never
}

function createStaticNavigator(router: DataRouter): StaticNavigator {
  const cannotNavigate = (): never => {
    throw new Error("Route fragment rendering cannot navigate on the server.")
  }

  return {
    createHref: router.createHref,
    encodeLocation: router.encodeLocation,
    push: cannotNavigate,
    replace: cannotNavigate,
    go: cannotNavigate,
    back: cannotNavigate,
    forward: cannotNavigate,
  }
}

export const defaultOctaneRenderer: OctaneRenderer = {
  createStaticRouter: (routes, context) =>
    createStaticRouter(
      routes as RouteObject[],
      context as StaticHandlerContext,
    ),
  renderToString: (component, props) =>
    renderToString(component as Parameters<typeof renderToString>[0], props),
  renderRouteFragment: (router, context, boundary) => {
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

    const dataRouterContext = {
      router: dataRouter,
      navigator: createStaticNavigator(dataRouter),
      static: true,
      staticContext,
      basename: staticContext.basename ?? "/",
    }
    const fragmentTree = renderMatches(state.matches.slice(matchIndex))
    const FragmentBoundaryProvider = routeFragmentBoundaryTarget.Provider
    const DataRouterProvider = UNSAFE_DataRouterContext.Provider
    const DataRouterStateProvider = UNSAFE_DataRouterStateContext.Provider
    const FetchersProvider = UNSAFE_FetchersContext.Provider
    const ViewTransitionProvider = UNSAFE_ViewTransitionContext.Provider
    const FragmentRoot = () => (
      <DataRouterProvider value={dataRouterContext}>
        <DataRouterStateProvider value={state}>
          <FetchersProvider value={new Map()}>
            <ViewTransitionProvider value={{ isTransitioning: false }}>
              <StaticRouter
                basename={staticContext.basename ?? "/"}
                location={state.location}
              >
                <FragmentBoundaryProvider value={boundary}>
                  {fragmentTree}
                </FragmentBoundaryProvider>
              </StaticRouter>
            </ViewTransitionProvider>
          </FetchersProvider>
        </DataRouterStateProvider>
      </DataRouterProvider>
    )

    return renderToString(FragmentRoot, {})
  },
  defaultRouterDocument: RouterDocument,
}
