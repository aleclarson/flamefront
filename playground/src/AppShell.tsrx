import {
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigation,
} from "@octanejs/remix-router"
import { useState } from "octane"
import { SiteFooter } from "./SiteFooter.tsrx"

export function AppShell() @{
  const location = useLocation()
  const navigation = useNavigation()
  const [shellCount, setShellCount] = useState(0)
  const isNavigating = navigation.state !== "idle"

  <div class="app-shell">
    <div
      class="shell-state"
      data-testid="shell-state"
      data-shell-path={location.pathname}
      data-transition-state={navigation.state}
    >
      <span data-testid="shell-path">Shell path: {location.pathname}</span>
      <span>Shell state: {shellCount}</span>
      <button
        data-testid="shell-counter"
        onClick={() => setShellCount(shellCount + 1)}
      >
        Shell count
        {shellCount}
      </button>
      <span class="shell-transition" data-testid="shell-transition">
        {isNavigating ? "Navigating in the shell" : "Shell ready"}
      </span>
    </div>
    <Outlet />
    <SiteFooter />
    <ScrollRestoration />
  </div>
}

export default AppShell
