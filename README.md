# Flamefront

Flamefront brings routing, server rendering, and static pages to Octane.
One route list connects your pages to the server, browser router, and build.

## Why try it?

- **Render each page where it makes sense.** On the server, at build time, or
  in the browser.
- **React Router-style loaders.** Load data beside your page component and read
  it with `useLoaderData`.
- **Shared layouts.** Keep navigation and shared UI in place as pages change.
- **Persistent shell state.** Keep players running, uploads progressing, and
  other shared UI state intact between pages without making the whole app
  client-rendered.
- **Control interactivity.** Activate a page immediately, when it becomes
  visible, or when someone interacts with it.
- **Markdown routes.** Use Markdown and MDX files as pages.

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

Flamefront is an early alpha and requires Node.js 26+. Expect changes before
1.0. Follow the setup guide for matching packages.

There is no built-in form action or mutation API yet. If your current framework
already covers your needs, there's no need to switch.

Licensed under [MIT](./LICENSE.md).

## Learn more

- [How Flamefront fits](./docs/index.md)
- [Route rendering and data](./docs/routes.md)
- [Build and deployment](./docs/deployment.md)
- [Migrating an existing app](./docs/brownfield-migration.md)
