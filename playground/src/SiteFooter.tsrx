import { Link, useLocation } from "@octanejs/remix-router"
import { navigation } from "./navigation.ts"

export function SiteFooter() @{
  const location = useLocation()

  <footer class="site-footer">
    <nav class="footer-nav" aria-label="Explore routes">
      @for (const item of navigation; key item.path) {
        <Link
          class={item.path === location.pathname ? "active" : ""}
          aria-current={item.path === location.pathname ? "page" : undefined}
          to={item.path}
          prefetch="intent"
        >{item.label}</Link>
      }
    </nav>
  </footer>
}
