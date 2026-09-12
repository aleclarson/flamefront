import { useEffect, useState } from "octane"

type Theme = "light" | "dark"

export function ThemeToggle() @{
  const [theme, setTheme] = useState<Theme>("light")

  useEffect(() => {
    const selected = document.documentElement.dataset.theme
    setTheme(selected === "dark" ? "dark" : "light")
  }, [])

  function toggle() {
    const next =
      theme === "dark" ? "light" : "dark"
    document.documentElement.dataset.theme = next
    localStorage.setItem("flamefront-theme", next)
    setTheme(next)
  }

  <button
    class="icon-button"
    type="button"
    onClick={toggle}
    aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
  >
    {theme === "dark" ? "☀" : "☾"}
  </button>
}
