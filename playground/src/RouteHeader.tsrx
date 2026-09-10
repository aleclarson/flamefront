import { Link } from "@octanejs/remix-router"
import { navigation } from "./navigation.ts"

type RouteHeaderProps = {
  activePath: string;
}

export function RouteHeader({ activePath }: RouteHeaderProps) @{
  <header class="site-header">
    <nav class="site-nav" aria-label="All routes">
      @for (const item of navigation; key item.path) {
        const className =
          item.path === activePath ? "active" : ""
        const linkName =
          item.path === "/" ? "home" : item.path.slice(1).replaceAll("/", "-")
        <Link
          class={className}
          data-route-link={item.path}
          data-testid={`nav-link-${linkName}`}
          to={item.path}
          prefetch="intent"
        >{item.label}</Link>
      }
    </nav>
  </header>
}
