import { redirect } from "@octanejs/remix-router"

export async function loader() {
  throw redirect("/destination")
}

export default function RedirectPage() @{
  <main data-testid="fixture-redirect">Redirect route</main>
}
