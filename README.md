# Flamefront

Flamefront brings routing, server rendering, and static pages to Octane.
Define your routes in one place and choose how each page renders.

## Why try it?

- **Mix rendering modes.** Serve live pages from the server, build static pages
  ahead of time, and render browser-first screens on the client.
- **Familiar route loaders.** Load data beside your page component and read it
  with `useLoaderData`, following the Remix-style pattern.
- **Shared layouts.** Keep navigation and other shared UI in place as pages change.
- **Choose when pages become interactive.** Activate them immediately, when
  they become visible, or when someone interacts with them.
- **Markdown pages included.** Turn Markdown and MDX files into routes.

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

The same list drives the server, browser router, and build. The shell holds
shared UI; each route points to an Octane page component.

## Quickstart

[Build and inspect the included app](./docs/getting-started.md) to try it,
then follow [Create a one-page app](./docs/create-app.md) to make your own.
The setup guide uses the current checkout so the package matches these examples.

## Status and support

Flamefront is an early alpha for Octane apps. Expect changes before 1.0.
You'll need Node.js 26+; the [setup guide](./docs/create-app.md) lists the
matching package versions.

## Before you try it

Flamefront is worth exploring if you want these rendering choices in an
Octane app. If your current framework already does what you need, you may
not need it.

There is no built-in form action or mutation API yet. The package uses the
[FSL-1.1-MIT license](./LICENSE.md).

## Learn more

- [How Flamefront fits](./docs/index.md)
- [Route rendering and data](./docs/routes.md)
- [Build and deployment](./docs/deployment.md)
- [Migrating an existing app](./docs/brownfield-migration.md)
