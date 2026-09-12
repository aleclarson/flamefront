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
- **Typed server actions and forms.** Call validated server functions from
  browser code, or use forms that work without JavaScript and gain pending
  states and loader refreshes when enhanced. [Add a mutation](./docs/forms-and-mutations.md).
- **Reuse unchanged static pages between builds.** Cache prerendered content and regenerate the deployment output on each build.
  [Enable incremental prerendering](./docs/incremental-prerendering.md).
- **Shared layouts.** Keep navigation and shared UI in place as pages change.
- **Persistent shell state.** Keep players running, uploads progressing, and
  other shared UI state intact between pages without making the whole app
  client-rendered.
- **Dynamic control of the whole document.** Render `<html>`, `<head>`, and
  `<body>` in a component, with reactive language, theme, and metadata across
  navigation. Keep Vite's `index.html` for simpler apps.
  [Define an app document](./docs/document.md).
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

Create and start an app with Node.js 26 or newer:

```sh
pnpm create flamefront@latest my-app
cd my-app
pnpm dev
```

See [Create a one-page app](./docs/create-app.md) for the generated files and
how the server-rendered route works. To evaluate Flamefront without creating a
project, [try the included app](./docs/getting-started.md).

## Before you try it

Flamefront is an early alpha and requires Node.js 26+. Octane, Vite, and
`@octanejs/remix-router` are required peer dependencies. Follow the
[setup guide](./docs/create-app.md) for matching packages. Expect changes before 1.0.

Flamefront supports [server actions and forms](./docs/forms-and-mutations.md).
Static-only hosting still needs a server-backed route or an application-owned
endpoint for writes.

Licensed under [MIT](./LICENSE.md).

## Learn more

- [How Flamefront fits](./docs/index.md)
- [Route rendering and data](./docs/routes.md)
- [Render the whole document](./docs/document.md)
- [Forms and mutations](./docs/forms-and-mutations.md)
- [Build and deployment](./docs/deployment.md)
- [Migrating an existing app](./docs/brownfield-migration.md)
