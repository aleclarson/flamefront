# Flamefront

Flamefront is the small, compiler-oriented framework layer being explored for
the Octane playground. Its package sources, CLI, and tests run directly as
TypeScript through Node's built-in type stripping; there is no package build
step or duplicate declaration surface.

The app owns one explicit, centralized route manifest:

```ts
import { defineApp, layout, route } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [
    layout("/src/ArticleShell.tsrx", [
      route("/articles/:slug", "/src/Article.tsrx", { render: "server" }),
    ]),
  ],
})
```

`layout(module, children)` creates a pathless layout group. `app.routeTree`
retains that authored nesting for compiler integrations, while `app.routes`
is the normalized leaf collection used for matching, filtering, static output,
and CLI inspection.

The manifest contains route behavior only. App-specific display data, such as
navigation labels, remains in app code.

Use `app.match(url)` to select the most specific route and read decoded
parameters. Pass `{ render: 'client' }` to select only routes with a particular
render mode. Flamefront delegates route grammar and specificity to
`@remix-run/route-pattern` rather than maintaining its own matcher.

Run `ff routes` from an app with `src/app.ts` to inspect its route graph.
Flamefront also owns the Vite lifecycle commands:

```sh
ff dev
ff build
ff preview
```

`ff build` emits client assets and a srvx-compatible `dist/server/server.js`,
then prerenders every static route. The server build default-exports one
`FlamefrontServerEntry`: srvx server options plus the mode-aware document and
route-data operations used by the lifecycle. `ff dev`, `ff build`, and
`ff preview` consume that default object directly; named server exports are not
part of the contract. `ff preview` runs the built handler through srvx, while
`srvx/static` serves static output and client assets.

## Composable server entry

The app's `src/entry-server.ts` is a small composition root. It supplies the
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

The Vite plugin generates `virtual:flamefront/server-routes`; supplying its
`importRoute` function keeps bundler-specific route importing at the app
boundary. The three layers have deliberately separate ownership:

- `createRouteRuntime({ app, importRoute, requestContext? })` owns route
  matching, route-module loading, loader execution, and the request-data
  response. `requestContext` receives the request, matched route and params,
  the purpose (`data` or `document`), and the document mode when applicable.
  For a document request, the resulting context is passed to the server router
  and its route loaders.
- `createOctaneDocuments({ app, runtime, routerDocument?, composeDocument? })`
  owns shell versus full route rendering, the Remix static-router branch,
  Octane rendering, and static route-data extraction. `routerDocument` can wrap
  the default `RouterProvider` with application providers. `composeDocument`
  receives the template, rendered body, CSS, framework hydration script, and
  request/mode metadata so the app can control HTML placement or add markup.
  `renderDocument` is the one mode-aware document operation; its mode is derived
  from the matched route, with explicit `shell` mode for build-time shell
  generation.
- `createSrvxServerEntry({ app, documents, assets, middleware?, headers? })`
  owns the srvx `fetch` handler, static asset middleware, template lookup,
  route-data dispatch, render-mode dispatch, and default response headers. The
  required `assets.clientDirectory` locates client files; `loadTemplate` can
  replace the default template lookup. Application middleware runs in
  declaration order around the framework transport, and `headers` can merge
  application policy with the default and document headers; its context also
  exposes the rendered document's status.

The app owns these composition seams: the route importer and request-scoped
services such as authentication or database handles; router providers and
document composition; template and asset locations; middleware and response
headers; and the shared routing paths. Flamefront continues to own render-mode
branching, loader and router semantics, the srvx adapter, and the default
redirect and asset behavior. The app does not need to duplicate those rules.

Configure shared paths on the app definition so matching, generated browser
routes, the server router, the data endpoint, and srvx use the same normalized
values:

```ts
import { defineApp, route } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routing: {
    basename: "/docs",
    dataPath: "/docs/__flamefront/data",
  },
  routes: [route("/", "/src/HomePage.tsrx", { render: "server" })],
})
```

Hydration and data protocols remain framework-owned. The document composer may
place or surround the supplied hydration script, but it cannot replace its
payload, serialization, or identifier. Likewise, the route-data JSON response,
static `.data.json` artifacts, and their browser loading behavior are not
application codecs. Custom templates and document markup must preserve the
framework-generated protocol pieces.

## Route loaders

A manifest entry is a route module. It may export a server loader alongside
its default component:

```ts
import type { LoaderArgs } from "flamefront/server"

export async function loader({ request, params }: LoaderArgs) {
  return { pathname: new URL(request.url).pathname, id: params.id }
}

export default function Route({ loaderData }) {
  // Render with data resolved before the component renders.
}
```

Server adapters call `loadRoute()` from `flamefront/server`. Browser routers
can call `app.load(url)` from their route loaders. `app.load(url)` and
`app.prefetch(url)` share a browser-side `RouteDataClient` with generated route
loaders, so a prefetched result is reused during client navigation. The data
source follows the route mode: client and server routes use the live data
endpoint, while static routes use their build-time `.data.json` artifact.

For link-intent prefetching, `prefetchRoute()` combines that data request with
the generated client module imports for the route and its pathless layouts:

```ts
import { prefetchRoute } from "flamefront/remix-router"

void prefetchRoute(app, "/products/one")
```

This preloads client navigation data and JavaScript. It does not request
server-rendered HTML because server-rendered routes also use client-side
navigation after the initial document load. A full document reload still uses
the route's server or static document policy.

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

Files and directories named `.server` are rejected if they remain reachable
from client code after loader removal. This turns accidental server imports into
compile-time errors in both development and production.

When client source maps are emitted, mixed route sources omit embedded
`sourcesContent` so removed server implementations are not republished in map
files. The generated client code remains mapped, but developer tools need local
source access to display those route sources.

## Remix Router adapter

Applications that install `@octanejs/remix-router` can opt into Flamefront's
Remix adapter. Flamefront keeps that package as an optional peer, so core route
configuration and matching remain router-agnostic.

The Vite plugin generates the application's nested, lazy route-object graph at
`virtual:flamefront/remix-routes`. Most applications can use the stable adapter
instead; it creates a browser router or a request-scoped static router over the
same graph:

```ts
import {
  createClientRouter,
  createServerRouter,
  routes,
} from "flamefront/remix-router"

const browserRouter = createClientRouter({ hydrationData })
const serverResult = await createServerRouter(request)
if (serverResult instanceof Response) return serverResult
```

The server result contains `router`, `context`, and serializable
`hydrationData`. Redirect responses are returned directly and route errors stay
in both the static context and hydration state. The exported `routes` collection
is available when an application needs lower-level Remix Router APIs.

Route modules and pathless layout modules use default component exports and are
loaded lazily. Server routers call route modules' exported loaders directly;
browser routers use Flamefront's route-data endpoint with navigation abort
signals and HTTP error handling.

Server routes can choose who owns hydration:

```ts
route("/reviews/:productId", "/src/Reviews.tsrx", {
  render: "server",
  hydration: { when: "visible", rootMargin: "200px" },
})
```

- `full` (or an omitted value) hydrates with the shared shell.
- `deferred` means the route authors its own Octane `<Hydrate>` boundaries.
- `none` generates a permanent `never()` boundary around server output.
- `{ when: 'idle' }`, `{ when: 'visible' }`,
  `{ when: 'interaction' }`, and `{ when: 'media' }` generate one route-level
  Octane boundary with the corresponding strategy options.

Generated boundaries defer only DOM that came from server rendering. If the same route is
first mounted by client navigation, Octane renders it immediately. This makes
the route component a deferred server-rendered region within the interactive shared
layout without delaying later in-app navigation. Static routes accept `none`, and
client routes accept `full`; trigger objects are server-only because they need
existing server HTML to defer.
