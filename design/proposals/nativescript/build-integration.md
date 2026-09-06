# NativeScript build integration

> Define how Flamefront contributes the native route graph while NativeScript
> Vite and NativeScript Octane own compilation, packaging, and HMR.

## Core ideas

- NativeScript Vite remains the owner of iOS/Android builds and native assets.
- `@nativescript-community/vite-octane` remains the owner of NativeScript
  Octane compiler integration and component HMR.
- Flamefront contributes a manifest/code-generation plugin and native runtime.
- Native entries are TSX compiled with the NativeScript Octane JSX runtime.
- A native build must exclude browser router, DOM, SSR, and fragment modules.

## Tool ownership

| Concern                                     | Owner                                 |
| ------------------------------------------- | ------------------------------------- |
| NativeScript project and platform build     | NativeScript CLI/Vite                 |
| Native JSX renderer and host commands       | `@nativescript-community/octane`      |
| Native Octane Vite flavor and HMR           | `@nativescript-community/vite-octane` |
| Manifest normalization and route projection | Flamefront                            |
| Native router context and navigation host   | Flamefront native adapter             |
| Native module resolution and bundling       | NativeScript Vite/Rollup              |

Flamefront should not make `ff build` impersonate the NativeScript build. A
NativeScript app should run the NativeScript workflow and add Flamefront's
native route plugin to that Vite graph.

## Illustrative configuration

The exact plugin API is undecided, but the integration should have this shape:

```ts
import { defineConfig, mergeConfig } from "vite"
import { octaneConfig } from "@nativescript-community/vite-octane"
import { nativeScriptRenderers } from "@nativescript-community/octane/config"
import { flamefrontNativeScript } from "flamefront/nativescript/vite"

export default defineConfig(({ mode }) =>
  mergeConfig(
    octaneConfig({
      mode,
      octane: {
        renderers: nativeScriptRenderers({
          include: "src/native/**/*.tsx",
        }),
      },
    }),
    {
      plugins: [
        flamefrontNativeScript({
          manifest: "/src/app.ts",
        }),
      ],
    },
  ),
)
```

The native renderer configuration should use
`@nativescript-community/octane` as `jsxImportSource`. See the [NativeScript
Octane package guide](https://github.com/nativescript-community/octane/blob/main/packages/octane/README.md)
and [Vite flavor guide](https://github.com/nativescript-community/octane/blob/main/packages/vite-octane/README.md)
for the renderer and Vite integration contracts. Native route modules should
normally live in a native source tree so the platform boundary is visible in
imports and review.

## Generated module boundary

The Flamefront plugin should generate a native virtual module containing:

- normalized native route metadata;
- lazy shell, layout, and route-module factories;
- native route type declarations;
- the shared basename and URL configuration;
- invalidation when the manifest or route entries change.

The generated native module must not import:

- `flamefront/fragment`;
- `flamefront/octane-client`;
- browser `RouterDocument` or hydration code;
- `@octanejs/remix-router` browser runtime;
- any module that requires `window` or `document`.

The native bundle should have a test that fails if these dependencies appear.

## HMR

Native component HMR should continue to come from the NativeScript Octane Vite
flavor. Flamefront only needs to invalidate generated route modules when the
manifest, route entry, or native route metadata changes.

Manifest changes may require a full native app reload if the physical
navigation host cannot safely replace its route table. Component edits should
retain the existing Octane HMR behavior.

## Version gate

The NativeScript Octane package, `octane`, and `@octanejs/vite-plugin` must be
treated as one compatibility matrix. Flamefront should publish the supported
matrix rather than allowing its web-only exact peer versions to silently govern
the native integration.

The current workspace pins older Octane packages for the web implementation;
that compatibility decision should be resolved before a native canary is
added.
