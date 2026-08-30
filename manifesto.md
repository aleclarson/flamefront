# What Flamefront is for

Web apps rarely need one rendering strategy. Marketing pages can be static.
Account pages may need server rendering. Workspaces may be better in the
browser. Those routes should still live in one app.

Flamefront is a Vite-first meta-framework for Octane. Each route can render in
the browser, on the server, or during the build. It can also decide when, or if,
its JavaScript runs. One typed manifest drives the browser, server, and build.

The point is simple: use one stack and choose delivery per route.

## Octane renders everything

Flamefront uses Octane on the server, at build time, and in the browser. You do
not switch to a separate template format for server or static pages. Partial
hydration uses the same TSRX components as the rest of the app.

Developers learn one component model. Components can move between rendering
modes without being rewritten in another language.

## HTML does not require immediate JavaScript

Render mode decides where the HTML comes from. Hydration policy decides when
the JavaScript starts. A server or static route can hydrate immediately, wait
for idle time, visibility, media, or interaction, or never hydrate at all.

This lets a page send useful HTML without turning the whole route into a client
application.

## The shell stays mounted

Every Flamefront app has a persistent shell and a routed outlet. The shell can
hold an audio player, a pinned video, an upload, global search, or other state
that should survive navigation. Only the outlet changes between routes.

Server and static routes navigate with HTML fragments. Client routes load data
and a module. The same router and `<Link>` handle both paths, so the app keeps
one location and one navigation model.

## Types connect routes, loaders, and components

The route manifest is typed. Route parameters come from the URL path. Components
can infer loader results with `typeof loader`. Generated types keep the route
graph consistent across browser and server code.

Types do not replace runtime validation. They do catch avoidable mismatches in
paths, parameters, and loader data.

## Vite runs the toolchain

Flamefront builds on Vite for development, transforms, code splitting, and
production output. It does not put another build pipeline beside Vite.

Vite-first may feel like table stakes for a modern meta-framework. It still
matters. Existing Vite knowledge, plugins, and tooling continue to apply.

## srvx keeps hosting open

Flamefront's server entry targets [srvx](https://srvx.h3.dev) instead of one
hosting provider. That keeps rendering separate from the server runtime and
gives Flamefront a clear path to adapters for different providers.

Nuxt already uses srvx internally through Nitro. Flamefront is building on the
same server layer instead of creating its own.

srvx gives it a portable server contract to build on.

## Server code stays on the server

The client build removes loaders and their private dependencies. It rejects
server-only imports that still cross into the browser graph. Server and static
routes also use HTML fragments instead of making the authored route module a
normal browser dependency.

This keeps client bundles smaller and reduces the chance of shipping server
code by accident.

## One route model keeps the pieces aligned

Octane renders. Remix Router navigates. Vite builds. srvx serves. Flamefront
coordinates them through one route model.

That model owns paths, render modes, hydration policies, and shared URL
settings. The browser, server, and build consume the same decisions. Flamefront
does not need to reconstruct them from filenames or maintain another route
table.

Flamefront is not trying to replace the tools under it. Its job is to make them
agree.
