import { useLoaderData } from "@octanejs/remix-router"
import type { LoaderArgs } from "flamefront/server"

export async function loader({ request }: LoaderArgs) {
  return { pathname: new URL(request.url).pathname }
}

export default function StaticPage() @{
  const data = useLoaderData<{ pathname: string }>()

  <main data-testid="fixture-static">
    Static loader:{" "}
    {data.pathname}
  </main>
}
