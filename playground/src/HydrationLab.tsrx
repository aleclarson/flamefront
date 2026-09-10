import { useLoaderData } from "@octanejs/remix-router"
import type { LoaderArgs } from "flamefront/server"
import { Hydrate } from "octane"
import { idle, interaction, media, visible } from "octane/hydration"
import { HydrationProbe } from "./HydrationProbe.tsrx"
import { RouteFacts } from "./RouteFacts.tsrx"

type HydrationLabData = {
  message: string;
}

export async function loader({ request }: LoaderArgs): Promise<
  HydrationLabData
> {
  return {
    message: `Loader completed ${new URL(request.url).pathname} before server render.`,
  }
}

export function HydrationLab() @{
  const loaderData = useLoaderData<HydrationLabData>()

  <main class="page" data-route="/hydration" data-render-mode="server">
    <section class="content content-wide">
      <p class="eyebrow">Author-owned hydration</p>
      <h1>Four boundaries, one server response</h1>
      <p>
        The route manifest says
        <code>deferred</code>, so Flamefront leaves boundary placement to this
        component. Each card starts as server HTML and wakes on its own trigger.
      </p>
      <RouteFacts pathname="/hydration" loader={loaderData.message} />
      <div class="probe-grid">
        <Hydrate when={idle({ timeout: 750 })}>
          <HydrationProbe
            label="Idle"
            description="Waits for an idle callback, with a short timeout fallback."
          />
        </Hydrate>
        <Hydrate when={visible({ rootMargin: "0px", threshold: 0.25 })}>
          <HydrationProbe
            label="Visible"
            description="Activates after one quarter of this card enters the viewport."
          />
        </Hydrate>
        <Hydrate when={interaction({ events: ["click", "focusin"] })}>
          <HydrationProbe
            label="Interaction"
            description="Captures the first click or focus and replays it after hydration."
            interactive
          />
        </Hydrate>
        <Hydrate when={media("(min-width: 48rem)")}>
          <HydrationProbe
            label="Media"
            description="Hydrates when the viewport is at least 48rem wide."
          />
        </Hydrate>
      </div>
    </section>
  </main>
}

export default HydrationLab
