import type { LoaderArgs } from "flamefront/server"
import { useLoaderData } from "@octanejs/remix-router"
import { RouteFacts } from "./RouteFacts.tsrx"

type AboutData = {
  message: string;
}

export async function loader({ request }: LoaderArgs): Promise<AboutData> {
  return {
    message: `Generated ${new URL(request.url).pathname} during ff build.`,
  }
}

export function AboutPage() @{
  const { message } = useLoaderData<AboutData>()

  <main class="page" data-route="/about" data-render-mode="static">
    <section class="content">
      <p class="eyebrow">Static route data</p>
      <h1>Built once, served as a document</h1>
      <p>
        Flamefront runs this loader during the production build and writes the
        HTML beside its route-data artifact. The browser router still boots in
        this document.
      </p>
      <RouteFacts pathname="/about" loader={message} />
      <p data-testid="about-static-proof">
        This page is complete HTML before srvx starts.
      </p>
    </section>
  </main>
}

export default AboutPage
