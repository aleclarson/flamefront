# Invariants

These rules are the review checklist for changes that cross Flamefront
subsystems. Each rule names the failure it prevents and the tests that currently
exercise it.

## One route model

The normalized app definition is the only authority for matching, render mode,
shell and route hydration policy, basename, and data path. `shellHydration`
defaults to `full` and is emitted in generated shell metadata. Generated
modules, server transport, prefetch, and static generation must consume that
model.

Do not add a second matcher or reconstruct route policy from filenames. Keep the
layout-preserving `routeTree` and flattened `routes` list as two views of the
same frozen input.

Primary coverage: `manifest.test.ts`, `vite.test.ts`, and `server.test.ts`.

## Shared URL semantics

The same normalized basename applies to app matching, generated Remix Router
configuration, static requests, fragment cache keys, and asset fallback. The
configured data path must agree between generated browser loaders and srvx.

Reserved shell and fragment query parameters must not reach app matching,
request-context factories, or loaders. Strip them before application code runs.

Primary coverage: `manifest.test.ts`, `fragment.test.ts`,
`remix-route-data.test.ts`, and `server.test.ts`.

## One router, two ownership regions

Server rendering and browser startup use the same router document unless the
application explicitly supplies the same override to both compositions. The
browser creates one authoritative Remix Router instance, with the shell root
at `#root` and a separate routed outlet root beneath the shell's `<Outlet />`.
The outlet receives live router contexts through a bridge; it must not create a
second router.

The shell root uses `flamefront-shell-` IDs and outlet roots use
`flamefront-outlet-` IDs. These namespaces must remain distinct so hydration
cannot collide across roots. Pathless layouts remain inside the outlet route
hierarchy and do not become independent roots.

Server and static startup must wait for router initialization before hydrating
the existing shell and outlet markup. Client startup renders a fresh shell root
and mounts the outlet root. A dormant or inert shell must not block outlet
navigation.

Primary coverage: `octane-client.test.ts`, `octane.test.ts`, and browser fixture
checks for shell and outlet navigation.

## Request-scoped context stays request-scoped

Create request context once for one route operation and pass that exact value to
the Remix Router query and route loaders. Do not cache request context in the app
definition, generated modules, or document service.

The purpose field distinguishes data work from document work. Document context
also carries the selected mode.

Primary coverage: `octane.test.ts`, `server-runtime.test.ts`, and
`remix-router.test.ts`.

## Server code does not survive in the browser graph

Client transforms remove server-only route exports and dependencies used only
by them. Any remaining import of a `.server` module or server directory from a
client module is an error. Client source maps must not embed authored route
source content.

The transform must preserve unrelated exports and already-unused authored code.
It is a targeted ownership boundary, not a general minifier.

Primary coverage: `vite.test.ts`.

## Fragment navigation stays HTML-first

A server or static route's browser rendering path is its fragment response.
Prefetch and navigation must not import the authored route module as the normal
rendering path. Client routes keep their route-data and module path. Static
route data comes from built artifacts rather than the live data endpoint.

Fragment artifacts must carry the current protocol identifier and stable
boundary metadata. Invalid protocols fail before insertion.

Static fragments remain reusable by origin and normalized pathname. Server
fragments use the full sanitized route URL, share concurrent work only, and
leave no settled response in the request cache. Keep the latest-artifact render
handoff separate from both request caches.

Primary coverage: `route-prefetch.test.ts`, `fragment.test.ts`,
`remix-route-data.test.ts`, `octane.test.ts`, and `vite.test.ts`.

## DOM ownership changes once

The current owner of a fragment host owns its content while it is raw inserted
HTML. It must release that ownership before a nested root hydrates the children.
The old nested root must unmount before replacement, and asynchronous hydration
must check that its host is still current. The shell root and routed outlet root
must never reconcile the same child tree simultaneously.

Router context must be re-provided inside the nested root. Context values should
retain their library types through the bridge. Do not hide mismatches with
`never` assertions.

Primary coverage: `fragment.test.ts`, plus browser fixture checks for hydrated
server and static routes.

## Render mode and hydration policy remain separate

Render mode selects whether fragment HTML comes from request-time rendering or
build output. Navigation strategy selects fragment transport or client module
rendering. Route hydration policy selects whether and when outlet HTML becomes
interactive; `shellHydration` independently selects whether and when the shell
becomes interactive. Validation rejects combinations that cannot affect the
selected render mode.

Do not infer render mode from a hydration policy or silently reinterpret legacy
mode names.

Primary coverage: `manifest.test.ts`, `lifecycle.test.ts`, and `vite.test.ts`.

## Build output stays deterministic and contained

Type generation writes only when content changes. Static output maps one
concrete route to files beneath `dist/client`. Parameterized static routes and
decoded paths that could escape that directory are rejected.

Each static route produces a document, route data, fragment HTML, and fragment
JSON. The build uses the built server entry for rendering so prerendering checks
the deployable server bundle.

Primary coverage: `typegen.test.ts` and `lifecycle.test.ts`.

## Transport preserves framework results

Redirect and error `Response` objects from routing pass through unchanged.
Document status and headers survive composition. Application middleware wraps
framework transport in declaration order, and application header hooks run
after document rendering.

The document service remains independent of sockets, filesystem lookup, and
HTTP server startup.

Primary coverage: `remix-router.test.ts`, `srvx.test.ts`, and `server.test.ts`.

## Updating the checklist

When a new cross-subsystem rule appears, add it here with the failure it
prevents and the tests that enforce it. If a rule cannot point to a test, either
add the test or state why automation cannot observe the contract.
