# Route manifest and native projection

> Define which parts of Flamefront's route manifest are universal and how
> NativeScript route modules are selected without creating a second manifest.

## Core ideas

- Existing web route definitions remain valid and keep their current meaning.
- Native shell, layout, and route entries are explicit platform projections.
- The compiler emits a native manifest plus lazy module factories.
- Web `render` modes describe web output; they do not describe native views.
- Native data loading is a client contract and must not execute server loaders.

## Current model

Flamefront currently normalizes a shell, nested layouts, and route leaves. A
route has a URL path, an entry module, and a web render mode. The generated web
module turns that model into browser routes, metadata, and lazy imports.

The native proposal should preserve those web fields and add native projection
data rather than reinterpret them.

## Illustrative manifest shape

The following shape is intentionally provisional. It shows the boundary, not a
final public API:

```ts
export const app = defineApp({
  shell: "/src/web/AppShell.tsrx",
  nativeShell: "/src/native/AppShell.tsx",

  routes: [
    {
      path: "/",
      entry: "/src/web/HomePage.tsrx",
      nativeEntry: "/src/native/HomePage.tsx",
      render: "server",
    },
    {
      path: "/products/:productId",
      entry: "/src/web/ProductPage.tsrx",
      nativeEntry: "/src/native/ProductPage.tsx",
      render: "server",
    },
  ],
})
```

The final API could use an `implementation: { web, native }` object instead.
Either form must support native entries on the shell, layouts, and leaf routes.
An application that declares NativeScript support but omits a required native
entry should fail during manifest validation rather than fail at navigation
time.

## Universal and platform-specific fields

| Field             | Ownership                | Native meaning                                                |
| ----------------- | ------------------------ | ------------------------------------------------------------- |
| `path`            | Shared                   | Same URL pattern and params.                                  |
| Layout nesting    | Shared                   | Same ordered match chain.                                     |
| `entry`           | Web projection           | Web component or document route module.                       |
| `nativeEntry`     | Native projection        | NativeScript Octane route module.                             |
| `render`          | Web projection           | `client`, `server`, or `static`; no native equivalent.        |
| `loader`          | Web/server projection    | Runs for HTTP or web route-data requests.                     |
| `clientLoader`    | Native/client projection | Runs during native route preparation.                         |
| `handle` metadata | Shared with extensions   | Platform-specific metadata may be attached to the projection. |

## Generated native artifacts

The NativeScript build should receive a virtual module with a shape similar to:

```ts
export const nativeManifest = [
  {
    id: "flamefront:route:products",
    path: "/products/:productId",
    parent: "flamefront:layout:root",
  },
]

export const nativeRouteModules = {
  "flamefront:route:products": () => import("/src/native/ProductPage.tsx"),
}
```

The generated module should also expose native shell/layout imports, route
metadata, and type information. It should not import the browser route graph.

The private route ID is useful for module lookup and cache keys. Public URLs,
generated hrefs, and deep links must continue to use paths.

## Route module contract

A native route module should be able to export:

```ts
export async function clientLoader({ request, params }) {
  return loadProduct(params.productId, request.signal)
}

export function ErrorBoundary() {
  // NativeScript UI for route-scoped errors.
}

export default function ProductPage() {
  // NativeScript JSX compiled with the NativeScript Octane renderer.
}
```

The shared data function should be ordinary platform-neutral code when web and
native use the same backend. The web `loader` and native `clientLoader` remain
separate entry points because their request, error, and execution environments
are different.

## Validation and type generation

The compiler should validate:

- every native layout has a native child-compatible implementation;
- every native route entry resolves to a native module;
- native route paths agree with their web paths;
- generated route params are derived from the shared path pattern;
- native-only modules do not enter the web bundle;
- web server-only exports do not enter the native bundle.

The same generated route-path and params types should be available to both
projections. Module-specific component props and loader results may remain
platform-specific.
