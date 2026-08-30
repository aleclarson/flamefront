# Brownfield migration

This guide describes a full migration of an existing web application to
Flamefront. It is for teams replacing the application's routing, rendering,
hydration, and route-data runtime in one cutover.

The migration also assumes that the application's React or Preact component
runtime is moving to Octane in the same cutover. The target route tree, shell,
layouts, and document lifecycle must render through Octane before production
switches to Flamefront.

This guide does not cover changing component source files from `.tsx` to
`.tsrx`. Octane can process `.tsx` through its Vite integration, so file
extension conversion is not a prerequisite here. A later guide can cover the
source-format and syntax migration separately.

The old application may remain available locally for comparison and may be
kept as a rollback artifact. This guide does not describe running two route
systems in production, moving only one feature area, or gradually splitting
traffic between old and new applications.

## What Flamefront replaces

Flamefront should replace the framework-owned parts of the application. It
does not require a rewrite of the application's domain code.

| Existing application part                         | Full-migration target                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Router, route registry, and route matching        | One `defineApp` manifest with the complete route tree                                                 |
| Server rendering entry and document lifecycle     | `entry-server.ts` composed from the Flamefront runtime, Octane documents, and selected server adapter |
| Browser router bootstrap and hydration            | `startOctaneClient` with the same router document used by the server                                  |
| React/Preact renderer, roots, and UI runtime      | Octane components, providers, rendering, and hydration                                                |
| Route-level read data and server request plumbing | Route `loader` functions plus request-scoped context                                                  |
| Static generation and route-data transport        | `ff build` and Flamefront's generated static files and fragments                                      |
| Framework-specific build and preview commands     | `ff dev`, `ff build`, and `ff preview`                                                                |
| Framework middleware and response headers         | Application middleware and headers passed to the Flamefront server entry                              |

Usually keep the following code:

- component markup, styles, and domain behavior that are compatible with
  Octane;
- database clients, service clients, and authentication providers;
- CSS, images, fonts, and application-owned assets;
- background jobs and non-HTTP services;
- tests that verify business behavior rather than framework wiring.

Adapt or replace code that depends on React, Preact, the old router, the old
server renderer, the browser bootstrap, or the route-data API. The component
runtime migration is part of this full cutover even when the files remain
`.tsx`.

## Before starting

Read the [alpha support matrix and known limitations](../README.md#supported-versions)
before choosing the target runtime. Pin the Flamefront version and matching
Octane, Remix Router, Vite, and Node versions for the migration branch.

Confirm that the application can meet these alpha requirements:

- it can use ESM and the Flamefront CLI convention of `src/app.ts`;
- its server build can provide `src/entry-server.ts` or an app-owned wrapper
  that reaches that convention;
- every route can be assigned `client`, `server`, or `static` behavior;
- every component reachable from the shell, layouts, and routes can render
  through Octane at cutover;
- React or Preact roots, provider implementations, router bindings, hooks,
  refs, portals, and error boundaries have an Octane target;
- read-side route data can be expressed as a loader;
- write operations can remain in application-owned endpoints or services;
- a Node process can serve server and client routes, unless the entire
  deployed application is covered by concrete static routes.

Flamefront does not currently define an action or mutation API. Do not make a
loader responsible for form submissions, commands, or other writes.

## Inventory the whole application

Before changing the router, make a route inventory. Include every URL,
including redirects, not-found behavior, health checks, authentication
boundaries, and routes that are generated from content. Record whether each
one belongs in the Flamefront manifest, server middleware, or an external
service after the cutover.

| Field                    | What to record                                                          |
| ------------------------ | ----------------------------------------------------------------------- |
| URL pattern              | The public path, parameter names, basename, and trailing-slash behavior |
| Current owner            | The current page, route module, router branch, or server handler        |
| Render behavior          | Browser-only, server-rendered, statically generated, or mixed           |
| Read data                | APIs, database queries, request headers, cookies, and route parameters  |
| Write data               | Forms, actions, mutations, uploads, and API calls                       |
| Server-only dependencies | Secrets, database handles, filesystem access, and private modules       |
| Shared UI                | Shells, layouts, providers, navigation, and error boundaries            |
| HTTP behavior            | Status codes, redirects, headers, caching, and error responses          |
| Deployment owner         | Node handler, CDN, static host, proxy, or external service              |
| Target                   | Flamefront route, render mode, loader, context, and deployment behavior |

Do not start the migration until the target column is complete. A route that
is missing from the manifest is a migration defect, even if its component has
already been ported.

Make a companion component-runtime inventory. Find the current root creation
and hydration calls, React or Preact imports, provider and context trees,
hooks, refs, portals, router bindings, error boundaries, SSR adapters, and
renderer-specific tests. Mark each item as keep, adapt for Octane, or remove.
This is an API and ownership inventory, not a `.tsx` to `.tsrx` rename list.

## Define the target shape

The target application has one explicit route manifest. The manifest owns the
shell, route paths, route entries, layouts, render modes, hydration policies,
and shared routing paths.

```ts
// src/app.ts
import { defineApp, layout, route } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsx",
  routes: [
    route("/", "/src/HomePage.tsx", { render: "server" }),
    layout("/src/AccountShell.tsx", [
      route("/account", "/src/AccountPage.tsx", { render: "client" }),
    ]),
  ],
})
```

These examples intentionally keep `.tsx` filenames. Convert the component
runtime and framework APIs to Octane, but do not make a `.tsx` to `.tsrx`
rename part of this migration's definition of done.

Use the existing public URLs whenever possible. If the old application uses a
prefix, set `routing.basename` and `routing.dataPath` on the app definition so
the matcher, generated browser routes, server router, data endpoint, and Web
Fetch entry transport use the same values.

Each route module keeps a default component export and may add a `loader` for
read-side data. The route entry is a Vite project-root module ID, such as
`/src/AccountPage.tsx`.

Choose the render mode from the application's behavior, not from the current
framework's terminology:

| Target mode | Use it when                                                                               |
| ----------- | ----------------------------------------------------------------------------------------- |
| `client`    | The route needs browser rendering or client-only interaction before it can show useful UI |
| `server`    | The response depends on the request, private data, redirects, or live loader data         |
| `static`    | The route has a known concrete path and can be generated at build time                    |

Static routes cannot use an unresolved `:` or `*` segment during prerendering.
Generate concrete entries or keep that route server-rendered.

## Replace the server boundary

Replace the old SSR entry, document renderer, route-data endpoint, and static
asset handler with one `src/entry-server.ts` composition root. The app still
owns request-scoped services, providers, middleware, headers, and document
composition.

The composition has four responsibilities:

1. import the generated route modules from
   `virtual:flamefront/server-routes`;
2. create a route runtime with the app and importer;
3. create Octane documents from that runtime;
4. pass the document service and asset location to `createServerEntry` from
   `flamefront/entry` and default-export the result. Use `target` in the Vite
   plugin for the built-in srvx asset host, or use Fetch asset callbacks for a
   Web host.

The complete composition is shown in the [server entry quickstart](../README.md#composable-server-entry).
Use `requestContext` on `createRouteRuntime` for request-scoped values such
as the authenticated user, database handle, locale, or feature flags. Route
loaders receive that context together with the request and decoded params.

Move existing middleware and response policy deliberately:

- authentication and request context belong in the request-context factory;
- application middleware belongs in the `middleware` option;
- application response policy belongs in `headers`;
- template and asset locations belong in the server entry's asset options;
- custom HTML placement belongs in `composeDocument`.

Do not rebuild the hydration payload or framework script by hand. A custom
document composer may place or wrap the supplied values, but it must preserve
the script, payload, serialization, and identifier that the client expects.

## Replace the browser boundary

Replace the old browser router initialization, root hydration call, and route
loader wiring with the Octane browser entry, `startOctaneClient({ app })`.

Keep the existing application providers when they are still needed. If the
server and browser need a provider-wrapped router document, export that
component from one shared module and pass the same component to
`createOctaneDocuments` and `startOctaneClient`.

Keep one `#root` element in the HTML template. Remove duplicate router roots,
manual hydration payload parsing, and client-side route-data fetchers that
duplicate Flamefront's generated loaders.

The browser entry may live outside the conventional example path, but the
application still needs a module entry in its HTML template. The matching
Vite plugins must be installed in the documented order:

```ts
plugins: [flamefront(), octane()]
```

## Migrate the component runtime

React or Preact to Octane is a required workstream in this migration. It is a
runtime and component-contract migration, not a file-extension exercise.

Replace or adapt these boundaries:

| React/Preact boundary                                   | Octane migration work                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `ReactDOM` or Preact root creation                      | Let the Flamefront document and browser entries own rendering and hydration            |
| React or Preact providers and context                   | Recreate the provider tree around the shared Octane router document                    |
| Router-specific components and hooks                    | Use the Flamefront Remix Router adapter and Octane-compatible navigation APIs          |
| Effect, memoization, ref, and lifecycle assumptions     | Review each component against Octane's hook and compiler behavior                      |
| Portals, imperative DOM ownership, and error boundaries | Rebuild the ownership boundary explicitly and test server, client, and hydrated states |
| Component tests tied to the old renderer                | Run them through the Octane renderer and add hydration coverage where needed           |

Preserve markup, styling, service calls, and business rules when their
semantics remain valid. Do not assume that a React or Preact component is
drop-in compatible just because its function signature looks similar. Check
hooks, context propagation, refs, event handling, portals, and server/client
ownership.

Keep the existing `.tsx` source layout if that is the chosen Octane input.
The later source-format guide can cover `.tsx` to `.tsrx` conversion without
mixing that concern into the Flamefront migration.

## Move route data without moving application ownership

For each route, separate reads from writes before porting code.

Move request-time reads into a route loader:

```ts
import type { LoaderArgs } from "flamefront/server"

export async function loader({
  request,
  params,
  context,
}: LoaderArgs<AppContext>) {
  return context.catalog.get(new URL(request.url), params.slug)
}
```

Keep the service implementation and database code where it is. The loader is
the route-facing adapter, not a replacement for the service layer.

Keep writes in the existing application-owned API, command handler, or form
endpoint. A route component can call that API and then revalidate or navigate
through the application's existing policy. Do not hide a write inside a
loader, and do not describe the migration as complete until every write path
has been tested.

Review server-only dependencies after every route conversion. Flamefront
removes `loader` and its server-only dependency graph from client route
modules, but a `.server` module that remains reachable from client code is a
build error.

## Move shared UI and layouts

Make the current persistent application shell the Flamefront `shell`. Move
route groups that share a pathless layout into `layout(...)` definitions.

Port the shell, layouts, and route components to Octane as part of the same
cutover. Keep their `.tsx` files when useful; the required change is their
renderer, component APIs, and ownership model.

Preserve these behaviors explicitly:

- provider order and provider scope;
- navigation links and active-route state;
- pending, error, and not-found UI;
- document title and metadata ownership;
- scroll restoration and focus behavior;
- analytics and page-view events.

Do not assume that a component's old router hooks have the same owner after
the migration. Replace route location, params, navigation, and loader-data
access at the component boundary, while leaving unrelated component logic
unchanged.

## Replace the build and deployment path

Remove the old framework's route compiler, SSR build command, browser bootstrap
command, and preview process after their responsibilities have moved.

Use the Flamefront lifecycle:

```sh
pnpm exec ff dev
pnpm exec ff build
pnpm exec ff preview
```

Deploy the complete output:

- `dist/client` contains browser assets, the HTML template, static route
  output, route data, and static fragment artifacts;
- `dist/server/server.js` contains the selected Web Fetch or adapter server
  entry.

Keep both directories together for any application with server or client
routes. A static host is suitable only when every deployed route is covered by
the generated static output. Deep links, redirects, live loaders, and
server-rendered errors require the Node handler.

Check the deployment in the same way users reach it. A static navigation that
works in the development server but fails against the deployed asset tree is
not a successful migration.

## Full migration sequence

The work can happen in a branch in this order. The production application
does not switch until the entire route inventory has a Flamefront target.

1. Freeze the current URL, status, redirect, and data contracts in tests.
2. Add the pinned Flamefront dependencies and configure ESM, Vite, and the
   matching Octane plugin.
3. Replace the React or Preact roots, provider tree, router bindings, and
   component runtime with Octane equivalents. Keep `.tsx` filenames unless a
   separate source-format decision says otherwise.
4. Create the complete `src/app.ts` manifest, including the shell, layouts,
   and every user-facing application route. Assign redirects, not-found
   responses, health checks, and other non-page endpoints to their documented
   server or external owners.
5. Port route modules and move read-side data into loaders. Keep write paths
   on their existing application-owned interfaces.
6. Create the server composition root and move request context, middleware,
   headers, templates, and asset locations.
7. Replace browser bootstrap and hydration with the Flamefront client entry.
8. Replace build, preview, static output, and deployment configuration.
9. Remove the old router, SSR entry, hydration code, route-data transport,
   React or Preact root and renderer dependencies, and old framework build
   dependencies.
10. Run the complete acceptance suite against a production build and a clean
    installation of the package.
11. Cut over the full application and retain the old build only as a rollback
    artifact.

## Cutover checks

Before switching production, verify the whole application rather than a sample
of routes.

### Route behavior

- every user-facing route appears in the Flamefront manifest, and every other
  public endpoint has a documented server or external owner;
- every shell, layout, and route component renders through Octane;
- direct loads and refreshes work for every route;
- server, client, and static modes match the inventory decision;
- route params are decoded and passed to loaders correctly;
- redirects, 404s, error responses, and status codes match the old contract;
- basenames and trailing-slash behavior work at the deployed origin;
- back and forward navigation preserve the expected document and data state.

### Data and security

- authenticated and unauthenticated requests receive the same intended
  policy;
- no React or Preact root, hydration call, or router runtime remains on the
  production path unless it has an explicitly documented interop boundary;
- cookies, headers, locale, and request context reach every loader that needs
  them;
- server-only modules do not enter client bundles;
- all form, mutation, upload, and retry paths still work;
- cache and revalidation behavior has been reviewed for live and static data.

### Build and operations

- `ff build` succeeds from a clean checkout;
- the deployed artifact contains both `dist/client` and `dist/server` when
  the app needs Node;
- static HTML, `.data.json`, `.fragment.html`, and `.fragment.json` files are
  served by the same path rules used in production;
- source maps, logs, metrics, error reporting, health checks, and graceful
  shutdown still work;
- the old application is no longer receiving production traffic;
- rollback has been rehearsed using the retained old build.

## Common migration mistakes

- Migrating only the browser router while leaving the old server document
  lifecycle in place.
- Treating React or Preact components as drop-in compatible without reviewing
  hooks, context, refs, portals, event behavior, and hydration ownership.
- Registering a route in the old router and forgetting to add it to the
  Flamefront manifest.
- Treating a loader as an action or putting a database write in it.
- Recreating hydration data instead of passing through the framework-provided
  document values.
- Serving only `dist/client` for an application with live server routes.
- Leaving a server-only import reachable from a client route component.
- Changing public paths during the framework migration without recording that
  as a separate product change.
- Removing the old build before the complete Flamefront build and deployment
  have passed in a clean environment.
- Renaming `.tsx` files to `.tsrx` and treating that filename change as the
  React/Preact-to-Octane migration.

For the exact package setup, server composition, browser entry, deployment
shape, and current alpha limitations, use the main [Flamefront README](../README.md).
