import { Link, useLoaderData, useLocation } from "@octanejs/remix-router"
import { useState } from "octane"
import type { LoaderArgs } from "flamefront/server"

let requestCount = 0

export async function loader({ request }: LoaderArgs) {
  const url = new URL(request.url)

  requestCount += 1
  return {
    pathname: url.pathname,
    query: url.searchParams.get("view") ?? "default",
    requestCount,
  }
}

export default function ServerPage() @{
  const data = useLoaderData<{
    pathname: string;
    query: string;
    requestCount: number;
  }>()
  const location = useLocation()
  const [count, setCount] = useState(0)

  <main data-testid="fixture-server">
    <p data-testid="fixture-server-data">
      Server loader:{" "}
      {data.pathname}
      {" "}
      {data.query}
      {" "}request{" "}
      {data.requestCount}
    </p>
    <p data-testid="fixture-server-location">
      Router location:{" "}
      {location.pathname}
      {location.search}
    </p>
    <Link to="/client">Client</Link>
    <button
      data-testid="fixture-server-counter"
      onClick={() => setCount(count + 1)}
    >
      Server count:{" "}
      {count}
    </button>
  </main>
}
