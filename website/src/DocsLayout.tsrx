import { Link, Outlet } from "@octanejs/remix-router"

const pages = [
  ["Overview", "/docs"],
  ["Create an app", "/docs/create-app"],
  ["Routes", "/docs/routes"],
  ["Forms", "/docs/forms-and-mutations"],
  ["Deployment", "/docs/deployment"],
] as const

export default function DocsLayout() @{
  <main class="page docs-layout">
    <nav class="docs-nav" aria-label="Documentation">
      @for (const [label, href] of pages; key href) {
        <Link to={href}>{label}</Link>
      }
    </nav>
    <article class="prose">
      <Outlet />
    </article>
  </main>
}
