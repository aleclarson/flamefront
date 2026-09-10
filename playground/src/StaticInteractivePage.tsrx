import { useLoaderData } from "@octanejs/remix-router"
import type { LoaderArgs } from "flamefront/server"
import { Hydrate } from "octane"
import { idle } from "octane/hydration"
import { HydrationProbe } from "./HydrationProbe.tsrx"
import { RouteFacts } from "./RouteFacts.tsrx"

type StaticInteractiveData = {
  message: string;
}

export async function loader({ request }: LoaderArgs): Promise<
  StaticInteractiveData
> {
  return {
    message: `Generated ${new URL(request.url).pathname} during ff build.`,
  }
}

export function StaticInteractivePage() @{
  const loaderData = useLoaderData<StaticInteractiveData>()

  <main class="page" data-route="/static-interactive" data-render-mode="static">
    <section class="content content-wide">
      <p class="eyebrow">Static document, live boundary</p>
      <h1>Build-time HTML with a split child</h1>
      <p>
        This route is generated during the build, then the browser hydrates the
        route and lets the nested boundary wake independently.
      </p>
      <RouteFacts pathname="/static-interactive" loader={loaderData.message} />
      <Hydrate when={idle({ timeout: 750 })}>
        <HydrationProbe
          label="Static"
          description="The document is static, but this child is still code-split and hydrated after idle."
        />
      </Hydrate>
      <p data-testid="static-interactive-proof">
        The page was generated statically and contains a deferred Octane
        boundary.
      </p>
    </section>
  </main>
}

export default StaticInteractivePage
