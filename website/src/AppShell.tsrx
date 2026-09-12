import { Link, Outlet, ScrollRestoration } from "@octanejs/remix-router"
import { ThemeToggle } from "./ThemeToggle.tsrx"
import { AmbientPlayer } from "./AmbientPlayer.tsrx"

export default function AppShell() @{
  <div class="shell">
    <header class="topbar">
      <Link className="brand" to="/">Flamefront</Link>
      <nav class="nav" aria-label="Primary">
        <Link to="/docs">Docs</Link>
        <Link to="/forum">Forum</Link>
        <Link to="/play">Play</Link>
        <a href="https://github.com/aleclarson/flamefront">Source</a>
      </nav>
      <div class="shell-tools">
        <AmbientPlayer />
        <ThemeToggle />
      </div>
    </header>
    <Outlet />
    <footer class="footer">Built with Flamefront · Early alpha · MIT</footer>
    <ScrollRestoration />
  </div>
}
