import { Outlet } from "@octanejs/remix-router"

export default function AppShell() @{
  <div data-testid="consumer-shell">
    <Outlet />
  </div>
}
