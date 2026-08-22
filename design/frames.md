# URL-targeted frames

Status: parked. Flamefront does not expose this API.

## General idea

A Frame would let an already hydrated route embed another route as an independently loaded and activated region:

```tsx
<Frame
  to="/products/octane"
  hydration={{ when: "visible" }}
  fallback={<ProductPlaceholder />}
/>
```

The `to` value would match Flamefront's generated route graph. The host would not statically import the target component or use an application-authored `lazy()` wrapper. On an initial server render, the Frame would contain the target route's HTML. In the browser, its Octane boundary would control when the target module downloads and hydrates.

A page could render several Frames pointing to different URLs or repeat the same URL. Native module caching would download a shared route module once, while every Frame would retain separate component state, fallback and error state, cancellation, and hydration policy.

The target should render its matched leaf module rather than its ancestor layouts. Otherwise embedding a route under the application shell could recursively render that shell.

## Intended ownership

Flamefront would own URL matching, generated module imports, server rendering, and composition with Octane hydration. Remix Router would continue to own navigation and route-module conventions. Octane would own each Frame's DOM adoption and activation trigger.

An embedded instance's hydration policy should belong to the `<Frame>` call rather than the target route. Two instances of the same route may need different activation behavior. The target route's existing hydration setting would still control ordinary page rendering.

## Why it is parked

Remix Router models one active location per data router and stores loader data by route ID. Two Frames targeting `/products/octane` and `/products/flamefront` would match the same route ID but require different params and possibly different loader results. `<Outlet>` cannot represent this because it only renders the next match in the active route branch.

The current public pieces do not close that gap. `renderMatches()` can establish route match context for another location, but hooks such as `useLoaderData()` still read the surrounding router's global data state. A faithful Frame would need a scoped route-region context containing its own location, matches, loader data, errors, pending state, and cancellation while reusing the parent browser router for links and navigation.

That support could be added to the Octane adapter layer without forking Remix Router's vendored core. A generic route-region API might load an arbitrary URL without changing history and provide the resulting state beneath a `RouteRegionProvider`. Flamefront could then compose that provider with an Octane hydration boundary.

Independent target loaders also raise decisions about duplicate request caching, revalidation, actions, relative navigation, redirects, status and head contributions, and server-side discovery of dynamically computed Frame targets. Restricting Frames to host loader data would avoid much of this work but would make them split components rather than complete route instances.

## Conditions for reconsideration

Revisit Frames when an application needs to embed route modules more than once or at locations independent of the browser URL, and ordinary nested routes or authored `<Hydrate>` boundaries cannot express the design.

Before implementation, settle these contracts:

- Whether Frame triggers also delay fresh client mounts or only hydration of initial server HTML.
- Whether target routes run independent loaders and actions.
- How a route-region API scopes standard Remix hooks without creating another router.
- How SSR discovers targets and resolves their data before rendering.
- Which state and requests duplicate Frame instances share.
