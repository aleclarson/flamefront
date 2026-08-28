import { Link, useLoaderData } from "@octanejs/remix-router"
import type { LoaderArgs } from "flamefront/server"

export async function loader({ request }: LoaderArgs) {
  return { pathname: new URL(request.url).pathname }
}

export default function ClientPage() @{
  const data = useLoaderData<{ pathname: string }>()

  <main data-testid="fixture-client">
    Client loader:
    {data.pathname}
    <Link to="/server">Server</Link>
  </main>
}
