# Flamefront

Flamefront is a pre-1.0 framework layer for Octane. Version
`0.1.0-alpha.0` is the first alpha intended for external app evaluation.
The package keeps its TypeScript sources and exposes the `ff` CLI. Node's
built-in type stripping runs the CLI, while Vite bundles the application.

Pin the alpha to an exact version. Alpha releases may change the route,
hydration, build, or peer dependency contracts before `1.0.0`.

## Install the alpha

Flamefront's package name is the unscoped `flamefront`. A minimal app uses
Flamefront with the matching Octane packages and Vite version:

```sh
pnpm add \
  flamefront@0.1.0-alpha.0 \
  @octanejs/remix-router@0.1.36 \
  @octanejs/vite-plugin@0.1.40 \
  octane@0.1.40 \
  vite@8.2.2
```

`@octanejs/remix-router` is an optional peer of Flamefront, but the
quickstart uses it for `Outlet`, `Link`, and loader data. The
`@octanejs/vite-plugin` package compiles TSRX and must be installed alongside
the Flamefront Vite plugin. Flamefront includes its Sätteri integration, so
Markdown support does not require a separate Vite plugin installation.

The app must use ESM and keep its route manifest at `src/app.ts`. The
server entry and browser entry can be placed elsewhere, but the commands
below assume the conventional paths shown here.

## Supported versions

| Package or runtime       | Supported version | Notes                                                                   |
| ------------------------ | ----------------- | ----------------------------------------------------------------------- |
| Node.js                  | `>=22.22.2`       | CI runs Node 22.22.2, 24.x, and 26.x.                                   |
| Vite                     | `^8.0.16`         | The repository and consumer check currently use Vite 8.2.2.             |
| Octane                   | `0.1.40`          | Flamefront declares this as an exact peer.                              |
| `@octanejs/vite-plugin`  | `0.1.40`          | Use the matching TSRX compiler plugin.                                  |
| `@octanejs/remix-router` | `0.1.36`          | Optional to Flamefront, required by the router and quickstart examples. |

The release checks use pnpm 11.21.0. Other package managers may work, but
they are not part of this alpha's verification contract.

## Migration guide

The [brownfield migration guide](./docs/brownfield-migration.md) covers a
full application cutover from an existing routing and rendering stack. It
maps the framework-owned boundaries to Flamefront while preserving application
code where possible.

## Minimal app quickstart

Create this small project after installing the packages above:

```
.
├── index.html
├── vite.config.ts
└── src
    ├── AboutPage.tsrx
    ├── AppShell.tsrx
    ├── HomePage.tsrx
    ├── app.ts
    ├── entry-server.ts
    └── main.ts
```

Set `"type": "module"` in the app's `package.json`, then add the Vite
configuration:

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { octane } from "@octanejs/vite-plugin"
import { flamefront } from "flamefront/vite"

export default defineConfig({
  plugins: [flamefront(), octane()],
})
```

The route manifest declares the persistent shell and two routes. The home
route renders on the server and has a loader. The about route is pre-rendered
as a static route:

```ts
// src/app.ts
import { defineApp, serverRoute, staticRoute } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [
    serverRoute("/", "/src/HomePage.tsrx"),
    staticRoute("/about", "/src/AboutPage.tsrx"),
  ],
})
```

```tsx
// src/AppShell.tsrx
import { Outlet } from "@octanejs/remix-router"

export default function AppShell() @{
  <div>
    <Outlet />
  </div>
}
```

```tsx
// src/HomePage.tsrx
import { useLoaderData } from "@octanejs/remix-router"
import type { LoaderArgs } from "flamefront/server"

export async function loader({ request }: LoaderArgs<"/">) {
  return { pathname: new URL(request.url).pathname }
}

export default function HomePage() @{
  const data = useLoaderData<typeof loader>()

  <main>
    Flamefront loader: {data.pathname}
  </main>
}
```

```tsx
// src/AboutPage.tsrx
export default function AboutPage() @{
  <main>About this app</main>
}
```

The server entry connects the generated route importer, route runtime, Octane
document service, and srvx transport. It must default-export the composed
entry:

```ts
// src/entry-server.ts
import { importRoute } from "virtual:flamefront/server-routes"
import { createOctaneDocuments } from "flamefront/octane"
import { createRouteRuntime } from "flamefront/server"
import { createSrvxServerEntry } from "flamefront/srvx"
import { app } from "./app.ts"

const runtime = createRouteRuntime({ app, importRoute })
const documents = createOctaneDocuments({ app, runtime })

export default createSrvxServerEntry({
  app,
  documents,
  assets: {
    clientDirectory: new URL("../client/", import.meta.url),
  },
})
```

The browser entry starts the generated Octane router and adopts the server
hydration payload:

```ts
// src/main.ts
import { startOctaneClient } from "flamefront/octane/client"
import { app } from "./app.ts"

await startOctaneClient({ app })
```

The HTML template only needs a module entry for the browser:

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flamefront app</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Run the app and inspect its graph:

```sh
pnpm exec ff dev --port 3000
pnpm exec ff routes
```

The CLI reads `src/app.ts` from the current working directory. The
development server uses the `--port` value, then `PORT`, and otherwise
defaults to 5173. Build and serve the production output with:

```sh
pnpm exec ff build
PORT=4173 pnpm exec ff preview
```

`ff routes --json` prints the normalized route collection. A route loader
receives a standard `Request` and decoded `params`; the result is available
through the matching Remix Router loader-data hook.

## Deployment shape

`ff build` produces one application artifact under `dist`:

- `dist/client` contains browser assets, the application template, and
  pre-rendered static route files.
- `dist/client/<route>/index.data.json` contains build-time route data for
  each static route.
- `dist/client/<route>/index.fragment.html` and
  `index.fragment.json` contain the static navigation artifacts.
- `dist/server/server.js` default-exports the srvx-compatible
  `FlamefrontServerEntry`.
- `dist/server/index.html` is the server template copied from the client
  build.

For a Node deployment, build in the build stage and run the packaged CLI in
the runtime stage:

```sh
pnpm exec ff build
PORT=3000 pnpm exec ff preview
```

Keep `dist/client` and `dist/server` together. The preview process serves
browser assets and static fragments, renders server and client routes through
the built entry, and handles the route-data endpoint. A custom Node host can
load the default export from `dist/server/server.js` and pass it to srvx;
the host must preserve the entry's middleware and lifecycle fields.

An app with only concrete `static` routes can serve `dist/client` from a
static host after the build. Server and client routes, live loaders, redirects,
and server-rendered error responses need the Node handler.

## Common failure guidance

| Symptom                                                    | Fix                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Could not find .../src/app.ts`                            | Run `ff` from the app root and export `app` from `src/app.ts`.                                                            |
| The server entry validation fails                          | Default-export the value returned by `createSrvxServerEntry`; named exports are not consumed by `ff`.                     |
| `virtual:flamefront/server-routes` cannot resolve          | Add `flamefront()` and `octane()` to the app's Vite plugins, in that order, and keep the import in the server entry.      |
| `ff preview` cannot find `dist/server/server.js`           | Run `ff build` first and start preview from the same app root.                                                            |
| A static link performs a full document load or returns 404 | Serve the complete `dist/client` tree, including the `.fragment.html` and `.fragment.json` files generated by `ff build`. |
| Hydration fails at startup                                 | Keep one `#root` element in the HTML template and let `startOctaneClient` use the same router document as the server.     |
| A dependency resolution error mentions a peer version      | Install the versions in the support matrix. Do not mix the alpha with a different Octane or Remix Router minor.           |

## Known limitations

- This is an alpha. Pin exact package versions and expect breaking changes
  before `1.0.0`. There is no alpha-to-public compatibility promise yet.
- Flamefront exports raw TypeScript files. The CLI depends on Node's built-in
  type stripping, and consumers need a toolchain that can resolve TypeScript
  package exports.
- The CLI expects `src/app.ts` and `src/entry-server.ts` at the project
  paths described above. Custom project layouts need an app-owned wrapper or a
  future lifecycle extension.
- Static pre-rendering accepts concrete paths only. A static route containing
  `:` or `*` cannot be generated without adding concrete route entries.
- Route modules have a default component export and may export a `loader`.
  Flamefront does not currently define an action or mutation API.
- Flamefront removes `loader` and its server-only dependency graph from
  client route modules. A `.server` module that remains reachable from
  client code is a build error.
- A custom document composer may move or wrap the framework-provided hydration
  script, but it must keep the script, payload, serialization, and identifier
  intact.
- Client source maps omit embedded `sourcesContent` for mixed route sources
  so removed server implementations are not republished in browser maps.
- Node is required for server and client routes. A static host is suitable
  only for an app whose deployed behavior is fully covered by the generated
  static output.

## License terms

Flamefront remains licensed under the Functional Source License, Version 1.1,
MIT Future License (`FSL-1.1-MIT`). The complete terms are in
[LICENSE.md](./LICENSE.md), and they control if this summary differs from the
license.

The current FSL grant permits use, copying, modification, derivative works,
public performance, public display, and redistribution for any Permitted
Purpose. A Competing Use is excluded. The license specifically lists internal
use and access, non-commercial education, non-commercial research, and
professional services provided to a licensee as Permitted Purposes.

Redistributions must include the license terms or a link to them and retain
the copyright notices. The software is provided without warranties or
liability. The license does not grant rights to use Flamefront trademarks,
trade names, service marks, or product names beyond identifying the software's
origin.

The license includes an irrevocable MIT grant that becomes effective on the
second anniversary of the date the software is made available. The current
`FSL-1.1-MIT` terms and the future MIT grant are part of the release
contract; this documentation does not change either one.

## Route manifest

The app owns one explicit, centralized route manifest:

```ts
import { defineApp, layout, serverRoute } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [
    layout("/src/ArticleShell.tsrx", [
      serverRoute("/articles/:slug", "/src/Article.tsrx"),
    ]),
  ],
})
```

`layout(module, children)` creates a pathless layout group. `app.routeTree`
retains that authored nesting for compiler integrations, while `app.routes`
is the normalized leaf collection used for matching, filtering, static output,
and CLI inspection.

`serverRoute`, `staticRoute`, and `clientRoute` set the matching `render`
option. Each accepts the same path and entry arguments as `route`, plus an
optional options object for `hydration`. Use `route` when an explicit
`render` option reads better.

`markdownRoute(path, entry, options)` is the `.md` shorthand. It marks the
entry as Markdown and defaults to `render: "static"`; `render` and `hydration`
can still be overridden:

```ts
import { markdownRoute } from "flamefront"

markdownRoute("/guide", "/src/Guide.md")
markdownRoute("/release-notes", "/src/ReleaseNotes.md", {
  render: "server",
})
```

Use ordinary `route` for `.mdx` entries because MDX already exports an Octane
component. There is no separate `mdxRoute` helper:

```ts
import { route } from "flamefront"

route("/components", "/src/Components.mdx", { render: "static" })
```

Markdown routes are compiled by the built-in Sätteri Vite integration. A
`.md` entry exports HTML and is adapted to an Octane component for route
rendering; a `.mdx` entry exports its compiled Octane component directly.

Every Flamefront document has two framework-owned regions: the persistent shell
and the routed outlet rendered by the shell's `<Outlet />`. They remain separate
ownership regions while sharing one generated router document and one
authoritative browser router. The shell owns the document chrome; the outlet
owns the current route and any matched pathless layouts. Application code still
uses one `#root` and does not manage either region's roots.

### Shell hydration

Configure the persistent shell with `shellHydration` on `defineApp`:

```ts
export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  shellHydration: "deferred",
  routes: [serverRoute("/docs", "/src/Docs.tsrx")],
})
```

The option accepts `full`, `deferred`, `none`, or the same generated trigger
objects as route hydration (`idle`, `visible`, `interaction`, and `media`). Its
default is `full`, and the normalized value is included in the generated shell
metadata. Shell policy is independent of `hydrationDefaults` and each route's
`hydration` policy.

- `full` activates the shell during initial startup.
- `deferred` leaves the shell dormant until the first location change. When it
  activates, it starts from the browser router's current state, including any
  navigation that happened while it was dormant.
- `none` keeps the shell HTML inert for the lifetime of the document. The
  routed outlet still navigates and mounts or hydrates according to its own
  route policy.
- A generated trigger uses the normal Octane `Hydrate` behavior for that
  trigger. It does not change the outlet's policy or create another router.

The shell root and every outlet root use distinct framework ID namespaces:
`flamefront-shell-` for the shell and `flamefront-outlet-` for routed content.
The outlet receives live Remix Router contexts through a framework-managed
bridge, so router hooks, links, navigation state, errors, scroll restoration,
and view transitions continue to use the same router even when the shell is
dormant. `layout(...)` describes router nesting and fragment boundaries; it does
not create an independently hydratable root or accept a layout hydration
policy.

Routes without an explicit hydration policy use the app's render-mode defaults:

```ts
export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  hydrationDefaults: {
    server: "deferred",
    static: "none",
  },
  routes: [serverRoute("/docs", "/src/Docs.tsrx")],
})
```

The built-in defaults for both server and static routes are `full`. An explicit
route policy always wins. Client routes always resolve to `full`, so they do
not have a client default. The shell has its own `shellHydration` default of
`full`; changing a route default does not change shell activation.

The manifest contains route behavior only. App-specific display data, such as
navigation labels, remains in app code.

Use `app.match(url)` to select the most specific route and read decoded
parameters. Pass `{ render: "client" }` to select only routes with a
particular render mode. Flamefront delegates route grammar and specificity to
`@remix-run/route-pattern` rather than maintaining its own matcher.

### Generated route types

Flamefront writes `.flamefront/types/route-import-map.d.ts` and
`.flamefront/types/markdown-modules.d.ts` during Vite startup and build. Run
`ff typegen` before a standalone editor or TypeScript check when Vite is not
running. Add `.flamefront/types` to `tsconfig.json` `include`; the directory
is generated output and should stay ignored by Git.

The declaration contains one relationship: each authored route pattern points
to its `typeof import(...)` route module. It does not copy route metadata or
run the TypeScript checker. A change to a route module's exports flows through
that import type without regenerating the map.

With the map present, `RouteParams<"/products/:productId">`, `app.match`,
`app.load`, `app.prefetch`, and `routeHref` retain route relationships. The
router's `href` helper receives the same generated page registration, so
required pattern parameters are checked:

```ts
import { href } from "@octanejs/remix-router"

const productUrl = href("/products/:productId", { productId: "octane" })
```

Use a path parameter when authoring a loader if its module needs typed params:

```ts
import type { LoaderArgs } from "flamefront/server"

export async function loader({ params }: LoaderArgs<"/products/:productId">) {
  return { id: params.productId }
}
```

Server route loads derive `loaderData` from the matched app route, including
when the generated Vite importer is passed through `createRouteRuntime` or
`loadRoute`. The virtual importer itself intentionally remains a broad
`entry: string` bundler boundary: `RouteImportMap` contains path-to-module
relationships only and does not duplicate entry metadata. An application that
owns its importer can make that boundary explicit with
`RouteImporterFor<typeof app.routes[number]>`.

When declarations are missing or stale, Flamefront accepts ordinary string
paths, keeps loader params as the existing broad record, and returns
`unknown` for route data. This fallback keeps manifest edits and untyped apps
working. The guarantees are compile-time only; loader payloads are not
validated at runtime.

`ff build` emits client assets and a srvx-compatible
`dist/server/server.js`, then pre-renders every static route. The server
build default-exports one `FlamefrontServerEntry`: srvx server options plus
the mode-aware document and route-data operations used by the lifecycle.
`ff dev`, `ff build`, and `ff preview` consume that default object
directly; named server exports are not part of the contract.

## Composable server entry

The app's `src/entry-server.ts` is a composition root. It supplies the
generated server route importer, then connects the route runtime, Octane
document service, and srvx transport:

```ts
import { importRoute } from "virtual:flamefront/server-routes"
import { createOctaneDocuments } from "flamefront/octane"
import { createRouteRuntime } from "flamefront/server"
import { createSrvxServerEntry } from "flamefront/srvx"
import { app } from "./app.ts"

const runtime = createRouteRuntime({ app, importRoute })
const documents = createOctaneDocuments({ app, runtime })

export default createSrvxServerEntry({
  app,
  documents,
  assets: {
    clientDirectory: new URL("../client/", import.meta.url),
  },
})
```

The three layers have separate ownership:

- `createRouteRuntime({ app, importRoute, requestContext? })` owns route
  matching, route-module loading, loader execution, and the request-data
  response. `requestContext` receives the request, matched route and params,
  the purpose (`data` or `document`), and the document mode when applicable.
  For a document request, the resulting context is passed to the server
  router and its route loaders.
- `createOctaneDocuments({ app, runtime, routerDocument?, composeDocument? })`
  owns shell versus full route rendering, the Remix static-router branch,
  Octane rendering, and static route-data extraction. Its generated default is
  shared with `startOctaneClient`. `routerDocument` can replace it with a
  shared application provider component. `composeDocument` receives the
  template, rendered body, CSS, framework hydration script, and request/mode
  metadata so the app can control HTML placement or add markup.
- `createSrvxServerEntry({ app, documents, assets, middleware?, headers? })`
  owns the srvx `fetch` handler, static asset middleware, template lookup,
  route-data dispatch, render-mode dispatch, and default response headers.
  The required `assets.clientDirectory` locates client files. Application
  middleware runs in declaration order around the framework transport, and
  `headers` can merge application policy with the default and document
  headers.

The app owns the route importer and request-scoped services such as
authentication or database handles, router providers and document composition,
template and asset locations, middleware and response headers, and shared
routing paths. Flamefront owns render-mode branching, loader and router
semantics, the srvx adapter, and default redirect and asset behavior.

Configure shared paths on the app definition so matching, generated browser
routes, the server router, the data endpoint, and srvx use the same values:

```ts
import { defineApp, serverRoute } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routing: {
    basename: "/docs",
    dataPath: "/docs/__flamefront/data",
  },
  routes: [serverRoute("/", "/src/HomePage.tsrx")],
})
```

Hydration and data protocols remain framework-owned. The document composer may
place or surround the supplied hydration script, but it cannot replace its
payload, serialization, or identifier. Likewise, the route-data JSON response,
static `.data.json` artifacts, and their browser loading behavior are not
application codecs.

## Octane browser entry

Use the matching client adapter instead of assembling the browser router and
root component separately:

```ts
import { startOctaneClient } from "flamefront/octane/client"
import { app } from "./app.ts"

await startOctaneClient({ app })
```

`startOctaneClient` mounts client-rendered routes and hydrates server or
static routes after the browser router initializes. It creates the shell root
under `#root`, then Flamefront manages the independently-owned routed outlet
root beneath the shell's `<Outlet />`. Both regions use the same browser router;
the outlet does not create a second router. The generated `RouterDocument` is
still the same component used by `createOctaneDocuments` for the shell's
`RouterProvider`, so server and browser provider hierarchies stay aligned.

Applications that wrap the router in providers can pass `routerDocument`.
Export that component from one shared module and pass the same import to
`createOctaneDocuments` and `startOctaneClient`.

The Vite plugin generates `virtual:flamefront/server-routes`; supplying its
`importRoute` function keeps bundler-specific route importing at the app
boundary. It also generates `virtual:flamefront/remix-routes` for the
Remix Router adapter.

## Route loaders

A manifest entry is a route module. It may export a server loader alongside
its default component:

```ts
import { useLoaderData } from "@octanejs/remix-router"
import type { LoaderArgs } from "flamefront/server"

export async function loader({ request, params }: LoaderArgs<"/products/:id">) {
  return { pathname: new URL(request.url).pathname, id: params.id }
}

export default function Route() {
  const loaderData = useLoaderData<typeof loader>()
  return loaderData
}
```

Server adapters call `loadRoute()` from `flamefront/server`. Browser routers
can call `app.load(url)` from their route loaders. `app.load(url)` and
`app.prefetch(url)` share a browser-side `RouteDataClient` with generated
client-route loaders, so a prefetched result is reused during client
navigation. `app.load` remains the explicit data-only API for static
`.data.json` artifacts.

Server and static route navigation use the route-fragment JSON transport.
Server fragments render for the incoming request. Static fragments come from
build output. Neither mode renders the authored route module from loader data
as its normal browser navigation path.

`prefetchRoute()` chooses resources from the matched route. Client routes warm
route data plus their client route and pathless layout modules:

```ts
import { prefetchRoute } from "flamefront/remix-router"

void prefetchRoute(app, "/products/one")
```

Server and static routes use the fragment transport instead of importing their
route module as a normal navigation renderer. `createRoutePrefetcher(app)`
wires the transport into the existing prefetch seam. A custom
`RoutePrefetchResources.routeFragment` callback can replace it.

The public `flamefront/fragment` entry exports the route-oriented fragment API,
including `RouteFragmentArtifact`, `RouteFragmentBoundary`,
`RouteFragmentCachePolicy`, `loadRouteFragment`, `prefetchRouteFragment`, and
`createRouteFragmentRoute`. The v1 discriminator is
`flamefront-route-fragment-v1`. The old static-fragment names have no aliases.

Flamefront's Vite transform loads the centralized route manifest. Octane
compiles TSRX first, then Flamefront removes loaders and their private
dependency graph from client modules while retaining them in server modules:

```ts
import { octane } from "@octanejs/vite-plugin"
import { flamefront } from "flamefront/vite"

export default {
  plugins: [flamefront(), octane()],
}
```

`flamefront()` includes `vite-plugin-satteri` by default. It transforms both
`.md` and `.mdx` entries and enables GFM and frontmatter by default. Configure
the parser with the public `markdown` option bag:

```ts
import { flamefront } from "flamefront/vite"

export default {
  plugins: [
    flamefront({
      markdown: {
        features: { math: true },
      },
    }),
    octane(),
  ],
}
```

The `markdown` options are passed to Sätteri for both Markdown and MDX. Use
`markdown.mdx` for additional MDX compiler options or set it to `false` to
disable only MDX. The MDX JSX runtime is fixed to Octane, which is the only
supported Flamefront renderer. Set `markdown: false` only when an application
intentionally wants to disable Flamefront's built-in Markdown integration.

Files and directories named `.server` are rejected if they remain reachable
from client code after loader removal. This turns accidental server imports
into compile-time errors in development and production.

When client source maps are emitted, mixed route sources omit embedded
`sourcesContent` so removed server implementations are not republished in
map files. The generated client code remains mapped, but developer tools need
local source access to display those route sources.

## Remix Router adapter

Applications that install `@octanejs/remix-router` can opt into Flamefront's
Remix adapter. Flamefront keeps that package as an optional peer, so core route
configuration and matching remain router-agnostic.

```ts
import {
  createClientRouter,
  createRoutePrefetcher,
  createServerRouter,
} from "flamefront/remix-router"

const browserRouter = createClientRouter({
  hydrationData,
  prefetch: createRoutePrefetcher(app),
})
const serverResult = await createServerRouter(request)
if (serverResult instanceof Response) return serverResult
```

The server result contains `router`, `context`, and serializable
`hydrationData`. Redirect responses are returned directly and route errors
stay in both the static context and hydration state. The exported `routes`
collection is available when an application needs lower-level Remix Router
APIs.

Pass `createRoutePrefetcher(app)` to the browser router's `prefetch`
option to connect `Link` and `NavLink` modes such as `prefetch="intent"`.
Programmatic callers can use the same router cache with
`router.prefetch(to)`.

Generated route objects expose `handle.flamefront` metadata with stable
`id`, `boundary`, and `parent` values. The adapter also exports the flat
`routeMetadata` collection. Leaf routes include their `render` mode and
`navigation` strategy. Server and static routes use
`navigation: "fragment"`; client routes use `navigation: "router"`. The
metadata is also part of the route-fragment contract. Each artifact records the
shell, layout, and leaf boundary hierarchy. Browser navigation inserts the leaf
HTML first, then applies the route's hydration policy.

Route modules and pathless layout modules use default component exports and
are loaded lazily. Server routers call route modules' exported loaders
directly. Client-route browser loaders use Flamefront's route-data endpoint with
navigation abort signals and HTTP error handling.

Server routes can choose who owns hydration:

```ts
serverRoute("/reviews/:productId", "/src/Reviews.tsrx", {
  hydration: { when: "visible", rootMargin: "200px" },
})
```

- `full` or an omitted value hydrates the routed outlet immediately. The shell
  still follows `shellHydration` and is not part of the outlet's root.
- `deferred` means the route authors its own Octane `<Hydrate>` boundaries.
- `none` generates a permanent `never()` boundary around server output.
- `{ when: "idle" }`, `{ when: "visible" }`,
  `{ when: "interaction" }`, and `{ when: "media" }` generate one
  route-level Octane boundary with the corresponding strategy options.

Generated boundaries defer HTML inserted by a document or fragment render.
Server and static routes accept `full`, `deferred`, `none`, and trigger objects.
Client routes accept `full` only. Route policies affect the routed outlet; they
do not override `shellHydration`.

## Alpha release notes

### 0.1.0-alpha.0

This release is the first external-consumer alpha of the owned `flamefront`
package. It includes:

- the unscoped `flamefront` package and `ff` executable;
- raw TypeScript exports for the route manifest, Vite integration, server
  runtime, srvx entry, Octane browser entry, and Remix Router adapter;
- `client`, `server`, and `static` render modes with route shorthands, layouts,
  loaders, hydration policies, static route data, and route fragments;
- `ff dev`, `ff build`, `ff preview`, and `ff routes`;
- packed-package consumer verification across development, build, preview, and
  route-data flows;
- browser acceptance coverage for hydration, client navigation, server and
  static fragments, loaders, errors, redirects, basenames, and history
  traversal.

Pin `flamefront@0.1.0-alpha.0` and the matching peer versions while
evaluating the alpha. Before upgrading, read the release notes, rebuild the
application, and rerun the full release checks. Alpha releases can change
public APIs, generated artifacts, or the supported version matrix without a
migration guarantee.

This documentation records the release candidate. Publishing the package and
making public announcements remain separate, supervisor-controlled actions.

## Public-release promotion checklist

Promote the alpha only when every item below is complete and recorded.

### Clean checkout

- [ ] Start from the intended release commit in a clean checkout.
- [ ] Confirm the package is still named `flamefront`, has the intended
      pre-1.0 version, exposes `ff`, and contains only intentional packed files.
- [ ] Run `pnpm install --frozen-lockfile` with pnpm 11.21.0.
- [ ] Run the release checks on Node 22.22.2, 24.x, and 26.x.
- [ ] Confirm `pnpm lint`, `pnpm format:check`, `pnpm typecheck`,
      `pnpm test`, `pnpm test:e2e`, and the production build all pass.
- [ ] Confirm `pnpm check` passes as the single aggregate gate.
- [ ] Inspect the packed tarball and verify that it contains the license,
      README, CLI files, and source exports, with no workspace-only files.

### Published-package verification

- [ ] Publish the exact candidate under the approved prerelease tag or
      registry policy. Do not replace the candidate after verification.
- [ ] Install that exact published version in a fresh consumer outside the
      workspace. Confirm the resolved package is not a workspace link.
- [ ] Run the consumer through development, production build, preview, route
      inspection, server and static fragment navigation, and route-data flows.
- [ ] Run the browser acceptance path against the published package and verify
      initial hydration, client routes, server and static fragments, loaders,
      errors, redirects, basenames, and back/forward navigation.
- [ ] Repeat the supported Node matrix against the published package.

### Public-release decision

- [ ] Record the final package version, support matrix, deployment shape,
      known limitations, and upgrade expectations.
- [ ] Confirm no known release-blocking failures remain in the issue tracker
      or release notes.
- [ ] Confirm the FSL-1.1-MIT file and its future MIT grant are unchanged.
- [ ] Obtain release-owner approval for the package publication and any
      announcement.
