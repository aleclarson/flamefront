import { Outlet } from "@octanejs/remix-router"

export default function AppShell() @{
  <div className="app-shell">
    <header>Flamefront</header>
    <Outlet />
  </div>
}
