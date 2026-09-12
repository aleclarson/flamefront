# Render the whole document

> Use an app document when application state should control `<html>`,
> `<head>`, or `<body>`, including during client navigation.

Add `document` beside `shell` in `src/app.ts`. Like shell and route entries,
the document entry is a Vite project-root module ID:

```ts
import { defineApp, serverRoute } from "flamefront"

export const app = defineApp({
  document: "/src/Document.tsrx",
  shell: "/src/AppShell.tsrx",
  routes: [serverRoute("/", "/src/HomePage.tsrx")],
})
```

Create `src/Document.tsrx`:

```tsx
import { Head, Scripts, type DocumentProps } from "flamefront/document"
import { useState } from "octane"

export default function Document({ children }: DocumentProps) @{
  const [language, setLanguage] = useState("en")

  <html lang={language}>
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>My app</title>
      <Head />
    </head>
    <body>
      <button onClick={() => setLanguage(language === "en" ? "fr" : "en")}>
        Change language
      </button>
      {children}
      <Scripts />
    </body>
  </html>
}
```

`children` contains the persistent shell and matched route. The document is
inside router context, so it can also use hooks such as `useLocation` and
`useMatches`. Its state persists across client and fragment navigation. Shell
and route hydration policies still apply to their own regions; the document
itself hydrates, including on client-rendered routes.

Place `<Head />` once inside `<head>` for Vite's styles and asset links, and
`<Scripts />` once at the end of `<body>` for client scripts and hydration data.
Flamefront supplies the doctype and Octane's collected styles. Author titles,
metadata, and document attributes in the component.

Keep the normal `src/main.ts` entry:

```ts
import { startOctaneClient } from "flamefront/octane/client"
import { app } from "./app.ts"

await startOctaneClient({ app })
```

The normal `createOctaneDocuments({ app, runtime })` server setup needs no
changes. Do not pass a `#root` container: Flamefront hydrates `document`.

You can remove `index.html`. Flamefront generates an internal Vite HTML entry
that loads `/src/main.ts`, allowing Vite to bundle and hash its assets. If you
keep `index.html`, its script, style, and link tags supply assets, including a
custom client entry. Its document attributes, title, and metadata are replaced
by those from the component.

Run `pnpm dev`, click **Change language**, and inspect the `<html lang>`
attribute. After client navigation, it should remain `fr`. Use `pnpm build`
and `pnpm preview` to check the production output; static routes also include
the document in their generated HTML.

Omit `document` to keep the standard Vite `index.html` and `#root` workflow.
