# NativeScript support proposal

> Explore how Flamefront could support NativeScript through a separate native
> router projection backed by NativeScript Octane.

**Status:** exploratory; not an implementation contract.

## Core ideas

- One normalized Flamefront manifest remains the source of truth for URLs,
  params, nesting, links, and route types.
- Web and NativeScript get separate generated route graphs and runtimes.
- NativeScript owns physical navigation; Flamefront owns matching and route
  preparation.
- NativeScript Octane renders native route components but does not become the
  router.
- Native route modules use client-side loading and native lifecycle semantics;
  browser SSR and fragment transport stay web-only.

## Documents

- [Architecture](./architecture.md) defines the two-projection model and
  ownership boundaries.
- [Route manifest](./route-manifest.md) describes the shared manifest and the
  native projection it should generate.
- [Native runtime](./native-runtime.md) describes route preparation, native
  contexts, `Outlet`, and the navigation host.
- [Build integration](./build-integration.md) describes NativeScript Vite,
  Octane compilation, HMR, and bundle boundaries.
- [Testing and acceptance](./testing-and-acceptance.md) defines conformance
  checks and the smallest useful MVP.
- [Open questions](./open-questions.md) records choices that should remain
  explicit until implementation begins.

## Scope

This proposal covers a NativeScript application that uses the same route
manifest as a Flamefront web application. It covers URL matching, nested route
modules, route data, deep links, native navigation, and the build boundary
between Flamefront and NativeScript Vite.

It does not define a NativeScript UI component library, replace NativeScript's
build tools, or require web and native components to share markup.

## Relationship to the current web implementation

The proposal adds a native projection. It does not turn the existing browser
render modes into native render modes, and it does not move DOM or server code
into the native bundle. The current browser behavior remains the compatibility
baseline while this proposal is evaluated.

## Prior art

The design follows the useful part of Coreframe's router approach: compile one
route model into independent platform adapters, use the same matcher semantics,
and let the native host commit physical navigation. The NativeScript-specific
renderer and lifecycle remain distinct from Coreframe's Flutter integration.
