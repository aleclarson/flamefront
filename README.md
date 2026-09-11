# Flamefront

Flamefront is a small routing and rendering layer for Octane. Define your
routes once, then choose server, static, or client rendering per route. The
same manifest drives local development, the build, and the browser router.

It is for early adopters who want a hybrid Octane app without maintaining
separate route lists or a custom server and rendering pipeline.

## Why try it?

| What you need                                        | What Flamefront gives you                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Different rendering strategies                       | Choose server, static, or client rendering per route.                                               |
| Fast pages without making everything client-rendered | Pre-render static pages and update server/static routes with fragment navigation.                   |
| Interactive UI that does not hydrate all at once     | Hydrate the shell and each route independently, including on idle, visibility, or interaction.      |
| One source of truth for routing                      | A single manifest describes paths, layouts, loaders, and render behavior.                           |
| Safe server data loading                             | Loader code and its private dependency graph are removed from client route builds.                  |
| Content-heavy sites                                  | Markdown and MDX routes, including glob-generated docs, work through the built-in Vite integration. |
| A small deployment surface                           | `ff build` produces browser assets plus a Web Fetch or adapter-based server entry.                  |

## Status and support

The current package is `0.1.0-alpha.0`. It is pre-1.0 and intended for
experimentation. Pin the package and its peers while evaluating it.

| Requirement              | Version    |
| ------------------------ | ---------- |
| Node.js                  | `>=26.0.0` |
| Octane                   | `0.2.7`    |
| Vite                     | `^8.3.0`   |
| `@octanejs/vite-plugin`  | `0.1.54`   |
| `@octanejs/remix-router` | `0.1.48`   |

> [!WARNING]
> Public APIs and generated output may change before `1.0.0`.

## Quickstart

Install the current alpha and the matching Octane packages:

```sh
pnpm add \
  flamefront@0.1.0-alpha.0 \
  @octanejs/remix-router@0.1.48 \
  @octanejs/vite-plugin@0.1.54 \
  octane@0.2.7 \
  vite@8.3.0
```

Use ESM (`"type": "module"`) and start with this layout:

```
.
├── index.html
├── vite.config.ts
└── src
    ├── app.ts
    ├── AppShell.tsrx
    ├── HomePage.tsrx
    ├── entry-server.ts
    └── main.ts
```

Configure Vite with Flamefront before the Octane plugin:

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { octane } from "@octanejs/vite-plugin"
import { flamefront } from "flamefront/vite"

export default defineConfig({
  plugins: [flamefront({ target: "node" }), octane()],
})
```

Define the shell and a server-rendered route:

```ts
// src/app.ts
import { defineApp, serverRoute } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [serverRoute("/", "/src/HomePage.tsrx")],
})
```

The shell owns persistent UI. Its `<Outlet />` is where the current route
appears:

```tsx
// src/AppShell.tsrx
import { Outlet } from "@octanejs/remix-router"

export default function AppShell() @{
  <div>
    <header>My app</header>
    <Outlet />
  </div>
}
```

A route can load data on the server and read it through the router:

```tsx
// src/HomePage.tsrx
import { useLoaderData } from "@octanejs/remix-router"
import type { LoaderArgs } from "flamefront/server"

export async function loader({ request }: LoaderArgs<"/">) {
  return { pathname: new URL(request.url).pathname }
}

export default function HomePage() @{
  const data = useLoaderData<typeof loader>()

  <main>Loaded at {data.pathname}</main>
}
```

Connect the generated route importer to the server entry:

```ts
// src/entry-server.ts
import { importRoute } from "virtual:flamefront/server-routes"
import { createOctaneDocuments } from "flamefront/octane"
import { createRouteRuntime } from "flamefront/server"
import { createServerEntry } from "flamefront/entry"
import { app } from "./app.ts"

const runtime = createRouteRuntime({ app, importRoute })
const documents = createOctaneDocuments({ app, runtime })

export default createServerEntry({
  app,
  documents,
  assets: {
    clientDirectory: new URL("../client/", import.meta.url),
  },
})
```

Start the browser entry:

```ts
// src/main.ts
import { startOctaneClient } from "flamefront/octane/client"
import { app } from "./app.ts"

await startOctaneClient({ app })
```

Your `index.html` needs a `#root` element and the browser module:

```html
<div id="root"></div>
<script type="module" src="/src/main.ts"></script>
```

Run it in development, inspect the manifest, or try the production output:

```sh
pnpm exec ff dev
pnpm exec ff routes
pnpm exec ff build
PORT=4173 pnpm exec ff preview
```

## Route modes

Most apps mix these modes:

| Mode     | Use it for                                  | What happens                                               |
| -------- | ------------------------------------------- | ---------------------------------------------------------- |
| `server` | Dynamic pages and loaders                   | HTML is rendered per request.                              |
| `static` | Docs, landing pages, and content            | HTML and navigation artifacts are generated at build time. |
| `client` | Browser-first or highly interactive screens | The route is rendered in the browser.                      |

The route aliases make the choice visible in the manifest:

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

Use `layout()` for shared nested UI. Use `markdownRoute()` for Markdown
pages, or `glob()` when a directory should become a route set:

```ts
import { defineApp, glob, markdownRoute } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: glob("/src/docs/**/*.md", (file) =>
    markdownRoute(file.routePath("/docs"), file.path),
  ),
})
```

Markdown support is included in the Flamefront Vite plugin; no separate
Markdown Vite plugin is required. `index.md` maps to the containing directory.

## Hydration and type safety

The shell and routed content are separate regions, so you can keep the
persistent chrome interactive while deferring a route—or leave a region inert.
Use `full`, `deferred`, `none`, or a trigger such as `idle`, `visible`, or
`interaction` when a route does not need immediate JavaScript.

Route patterns can also flow into TypeScript. For example, a loader for
`/products/:id` can declare `LoaderArgs<"/products/:id">` and receive a typed
`params.id`. Flamefront generates the route relationships during Vite startup
and build.

## Deployment

`ff build` writes:

- `dist/client` for browser assets and pre-rendered static routes.
- `dist/server` for the server entry and its assets.

The quickstart's `target: "node"` output can be served with `ff preview`.
Static-only apps can deploy `dist/client` to a static host. Apps with server
routes, loaders, redirects, or server-rendered errors need the server output.
The Vite plugin can also generate Web Fetch, Deno, or Bun-oriented entries.

If you are moving an existing app to Flamefront, start with the
[brownfield migration guide](./docs/brownfield-migration.md).

## Before you try it

- Flamefront expects `src/app.ts`, ESM, and a toolchain that can resolve its
  TypeScript package exports.
- Static routes use concrete paths; a dynamic pattern needs concrete entries
  before it can be pre-rendered.
- There is no action or mutation API yet.
- Node 26+ is required.
- The package is licensed under [FSL-1.1-MIT](./LICENSE.md): use, modification,
  and redistribution are allowed for permitted purposes, but Competing Use is
  excluded. The license includes an MIT grant that takes effect after two
  years.
