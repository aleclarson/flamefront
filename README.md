# Flamefront

Flamefront brings routing, server rendering, and static pages to Octane.
One route list connects your pages to the server, browser router, and build.

Use only the rendering your project needs. Pre-rendering, server-side rendering
(SSR), and client-side rendering (CSR) are available as requirements evolve;
you do not need to use all three to benefit. The same framework can serve
many or all of your Octane projects, even when each uses a different mode.

## Why try it?

- **Render each page where it makes sense.** On the server, at build time, or
  in the browser.
- **React Router-style loaders.** Load data beside your page component and read
  it with `useLoaderData`.
- **Shared layouts.** Keep navigation and shared UI in place as pages change.
- **Persistent shell state.** Keep players running, uploads progressing, and
  other shared UI state intact between pages without making the whole app
  client-rendered.
- **Choose when parts of a page become interactive.** Defer hydration until
  needed—for example, when content becomes visible or someone interacts with it.
- **Write pages in Markdown or MDX.** Include them alongside your Octane
  components in the route list.

## One route list

```ts
import { clientRoute, defineApp, serverRoute, staticRoute } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [
    serverRoute("/", "/src/HomePage.tsrx"),
    staticRoute("/docs", "/src/DocsPage.tsrx"),
    clientRoute("/settings", "/src/SettingsPage.tsrx"),
  ],
})
```

The shell holds shared UI. Each route pairs a URL with an Octane page component
and chooses how it renders.

## Quickstart

[Try the included app](./docs/getting-started.md): build a static page, inspect
its generated HTML, and serve it locally. Then [create your own app](./docs/create-app.md).

## Before you try it

Flamefront is an early alpha and requires Node.js 26+. Octane, Vite, and
`@octanejs/remix-router` are required peer dependencies. Follow the
[setup guide](./docs/create-app.md) for matching packages. Expect changes before 1.0.

There is no built-in form action or mutation API yet. If your current framework
already covers your needs, there's no need to switch.

Licensed under [MIT](./LICENSE.md).

## Learn more

- [How Flamefront fits](./docs/index.md)
- [Route rendering and data](./docs/routes.md)
- [Build and deployment](./docs/deployment.md)
- [Migrating an existing app](./docs/brownfield-migration.md)
