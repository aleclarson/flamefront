import { useLoaderData } from "@octanejs/remix-router"
import type { LoaderArgs } from "flamefront/server"
import { RouteFacts } from "./RouteFacts.tsrx"

type ServerStaticData = {
  message: string;
}

export async function loader({ request }: LoaderArgs): Promise<
  ServerStaticData
> {
  return {
    message: `Rendered ${new URL(request.url).pathname} once on the server.`,
  }
}

export function ServerStaticPage() @{
  const loaderData = useLoaderData<ServerStaticData>()

  <main class="page" data-route="/server-static" data-render-mode="server">
    <section class="content">
      <p class="eyebrow">Permanent server HTML</p>
      <h1>An inert page in an interactive shell</h1>
      <p>
        Flamefront wraps this route with Octane's
        <code>never()</code>
        strategy. The header, layout state, and shell counter hydrate, while
        this main area stays server-owned.
      </p>
      <RouteFacts pathname="/server-static" loader={loaderData.message} />
      <p class="static-note" data-testid="server-static-proof">
        No client event handlers are attached inside this surface.
      </p>
    </section>
  </main>
}

export default ServerStaticPage
