export async function loader() {
  throw new Response("Fixture error", { status: 418 })
}

export default function ErrorPage() @{
  <main data-testid="fixture-error">Error route</main>
}
