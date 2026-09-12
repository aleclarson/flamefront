import { Head, Scripts, type DocumentProps } from "flamefront/document"
import { useState } from "octane"
import { useLocation } from "@octanejs/remix-router"

export default function Document({ children }: DocumentProps) @{
  const [language, setLanguage] = useState("en")
  const location = useLocation()

  <html lang={language} data-path={location.pathname}>
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Flamefront document fixture</title>
      <Head />
    </head>
    <body>
      <button
        data-testid="document-language"
        onClick={() => setLanguage(language === "en" ? "fr" : "en")}
      >
        Change language
      </button>
      {children}
      <Scripts />
    </body>
    <style>
      :global(html) {
        --document-fixture-ready: 1;
      }
    </style>
  </html>
}
