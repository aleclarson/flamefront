# Maintainer onboarding

Flamefront turns one authored route manifest into a matched application model,
generated router modules, server rendering, browser navigation, route-data
loading, static output, and optional fragment hydration. A change to route
semantics usually affects several of those consumers.

The manifest is the source of truth. Generated code
and runtime adapters may add representation, but they must not invent a second
route model.

## The working model

An application supplies a persistent shell and a tree of pathless layouts and
leaf routes. Flamefront gives the shell and the routed outlet separate
ownership regions while keeping one browser router. Every leaf selects one
render mode:

| Mode     | Initial document                           | Later browser navigation                     |
| -------- | ------------------------------------------ | -------------------------------------------- |
| `client` | A generated shell document                 | Load data, then import and render the module |
| `server` | Render the matched router tree per request | Fetch and insert a live route fragment       |
| `static` | Serve a document generated at build time   | Fetch and insert a built route fragment      |

Hydration is a separate decision. `full`, `deferred`, `none`, and the
trigger-based `idle`, `visible`, `interaction`, and `media` policies control when
server or static HTML becomes interactive. Render mode decides where HTML comes
from. Hydration policy decides whether and when Octane owns that HTML in the
browser. The app-level `shellHydration` policy controls the shell; each route's
`hydration` policy controls the routed outlet. `shellHydration` defaults to
`full`. `deferred` shell hydration activates on the first location change and
uses the router's current state; `none` leaves the shell inert while outlet
navigation remains available. Generated shell triggers retain their normal
Octane behavior.

The authored manifest has two useful forms:

- `routeTree` retains layouts and is used to generate the router hierarchy.
- `routes` is the frozen leaf list used for matching, data selection, builds,
  and transport decisions.

Do not treat these as competing route collections. They are two views of the
same normalized input.

## The main responsibilities

Flamefront divides work among five parts:

1. The app model validates and freezes routes, normalizes shared routing paths,
   matches URLs, and selects live or static data loading.
2. The Vite integration evaluates the app model and generates browser and
   server router modules. It also removes server-only route exports from the
   browser graph.
3. The route runtime imports matched modules, constructs request context, and
   runs loaders.
4. The document service joins the route runtime, Remix Router, and Octane. It
   renders documents and route fragments without owning HTTP transport.
5. The srvx adapter classifies HTTP requests, serves built assets, and calls the
   document service.

The seams between these parts are intentional. The route runtime and document
renderer accept injected adapters so their behavior can be tested without
loading compiler-only modules or starting an HTTP server.

## Generated material

The build integration produces three kinds of generated material:

- a browser router module with the eager shell, lazy route components, loaders,
  shell and route metadata, and module preloaders;
- a server route importer that can load every unique leaf route module;
- a declaration-only route import map that connects authored paths to their
  module types.

Static builds add four files per static route: the full document, route data,
fragment HTML, and the complete fragment artifact. See
[route fragments](./fragments.md) for the transport contract and why the two
static fragment files exist.

## Terms used in the code

**Router document.** The single component that renders `RouterProvider` for
the shell root. The server renderer and browser bootstrap must use the same
component. The browser also manages a separate outlet root beneath the shell;
live router contexts are bridged into it rather than creating another router.

**Document service.** The result of `createOctaneDocuments`. It renders a full
document, loads route data, and renders a fragment artifact.

**Server entry.** The default export built from `createSrvxServerEntry`. It is
both an srvx server configuration and the lifecycle interface used by build and
preview commands.

**Boundary.** A stable generated shell, layout, or route identity. Boundaries
let a fragment response render and replace the matched part of a route
hierarchy. Only the shell and routed outlet are independent root owners;
pathless layouts remain inside the outlet hierarchy.

**Route fragment.** Versioned JSON containing route data, leaf HTML, boundary
HTML, hydration policy, and response status. Server routes produce it per
request. Static routes read it from build output.

**Protocol parameter.** A reserved query parameter used to distinguish shell
or fragment requests. Flamefront removes these parameters before application
matching and loaders run.

## Finding the right place to change

Use these source files as entry points:

| Concern                                  | Entry point                                                 |
| ---------------------------------------- | ----------------------------------------------------------- |
| Manifest and route types                 | [`src/index.ts`](../src/index.ts)                           |
| Route loading and request context        | [`src/server.ts`](../src/server.ts)                         |
| Vite generation and browser graph policy | [`src/vite.ts`](../src/vite.ts)                             |
| Document and fragment rendering          | [`src/octane.tsx`](../src/octane.tsx)                       |
| Browser runtime startup                  | [`src/octane-client-core.ts`](../src/octane-client-core.ts) |
| Fragment insertion and hydration         | [`src/fragment.tsx`](../src/fragment.tsx)                   |
| HTTP classification                      | [`src/srvx.ts`](../src/srvx.ts)                             |
| Build, dev, and preview orchestration    | [`src/lifecycle.ts`](../src/lifecycle.ts)                   |

Before changing one of these boundaries, read [architecture](./architecture.md)
and [invariants](./invariants.md). Then find the focused test for the behavior.
The test names are deliberately phrased as contracts and are usually a better
guide than nearby helper names.
