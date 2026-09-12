import { useLoaderData } from "@octanejs/remix-router"
import type { LoaderArgs } from "flamefront/server"

export async function loader({ request }: LoaderArgs<"/">) {
  return { pathname: new URL(request.url).pathname }
}

export default function HomePage() @{
  const data = useLoaderData<typeof loader>()

  <main>
    <p className="eyebrow">Server-rendered with Flamefront</p>
    <h1>Your app is ready.</h1>
    <p>The loader handled {data.pathname}</p>
  </main>
}
