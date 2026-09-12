import { defineConfig } from "@pandacss/dev"

export default defineConfig({
  preflight: true,
  include: ["./src/**/*.{ts,tsx,tsrx}"],
  exclude: [],
  jsxFramework: "react",
  outdir: "styled-system",
  globalCss: {
    "html, body": { minHeight: "100%" },
    html: { colorPalette: "gray" },
    body: {
      margin: "0",
      background: "var(--page)",
      color: "var(--text)",
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      lineHeight: "1.55",
    },
    "*": { boxSizing: "border-box" },
    a: { color: "inherit", textDecorationColor: "var(--muted)" },
    "a:hover": { textDecorationColor: "currentColor" },
    "button, input, textarea, select": { font: "inherit" },
    "button, .button": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.45rem",
      minHeight: "2.25rem",
      padding: "0.42rem 0.72rem",
      border: "1px solid var(--border)",
      borderRadius: "0.45rem",
      background: "var(--surface)",
      color: "var(--text)",
      textDecoration: "none",
      cursor: "pointer",
    },
    "button:hover, .button:hover": { borderColor: "var(--text)" },
    ":focus-visible": {
      outline: "2px solid var(--focus)",
      outlineOffset: "3px",
    },
    "code, pre, textarea.editor": {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    pre: {
      overflowX: "auto",
      padding: "1rem",
      border: "1px solid var(--border)",
      borderRadius: "0.5rem",
      background: "var(--surface)",
    },
  },
})
