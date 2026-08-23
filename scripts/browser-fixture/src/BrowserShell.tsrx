import { Link, Outlet, useLocation } from "@octanejs/remix-router"
import { useState } from "octane"

export default function BrowserShell() @{
  const location = useLocation()
  const [count, setCount] = useState(0)

  <div data-testid="fixture-shell">
    <p data-testid="fixture-path">Shell path: {location.pathname}</p>
    <button
      data-testid="fixture-shell-counter"
      onClick={() => setCount(count + 1)}
    >
      Shell count:
      {count}
    </button>
    <nav aria-label="Fixture routes">
      <Link to="/client">Client</Link>
      <Link to="/static">Static</Link>
      <Link to="/error">Error</Link>
      <Link to="/redirect">Redirect</Link>
    </nav>
    <Outlet />
  </div>
}
