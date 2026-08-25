import type { LoaderArgs } from "../../src/server.ts"

export async function loader({ request }: LoaderArgs<"/">) {
  return { pathname: new URL(request.url).pathname }
}

export default function Home() {
  return null
}
