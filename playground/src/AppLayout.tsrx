import { Outlet, useLocation } from "@octanejs/remix-router"
import { useState } from "octane"
import { RouteHeader } from "./RouteHeader.tsrx"

export function AppLayout() @{
  const location = useLocation()
  const [layoutCount, setLayoutCount] = useState(0)

  <div class="app-layout">
    <RouteHeader activePath={location.pathname} />
    <div class="layout-state" data-testid="layout-state">
      <span data-testid="layout-path">Layout path: {location.pathname}</span>
      <span>App layout state: {layoutCount}</span>
      <button
        data-testid="layout-counter"
        onClick={() => setLayoutCount(layoutCount + 1)}
      >
        Layout count
        {layoutCount}
      </button>
    </div>
    <Outlet />
  </div>
}

export default AppLayout
