# NativeScript proposal open questions

> Keep unresolved choices visible so the proposal does not accidentally become
> an implementation contract.

## Core ideas

- Unresolved choices should be recorded beside their constraints and evidence.
- Platform-specific behavior should be explicit in the manifest and runtime.
- The first implementation should choose the smallest model that preserves a
  path to richer NativeScript navigation.
- Questions can move into accepted design notes once implementation validates
  them.

## Manifest syntax

- Should native entries be `nativeEntry`, or should entries become
  `implementation: { web, native }`?
- Should a route be allowed to have only a web or only a native entry?
- Does a native shell always need a native version when the web shell exists?
- How should platform-specific layout metadata be represented?

## Navigation model

- Is the first NativeScript adapter a single `Frame`, a `Page`-content host, or
  a small abstraction that can support both?
- When should a URL change push a page, replace the current page, or update the
  current route branch in place?
- How should hardware back, gesture back, and an empty stack map to URL state?
- What host API is needed before tabs and named stacks can be added?

## Route lifetime

- Are matched layouts recreated on every navigation or retained by policy?
- Which route lifecycle hooks are needed beyond component mount/unmount?
- Where do route-local caches live when a NativeScript page remains on a stack?
- How should a destroyed native window cancel outstanding preparation work?

## Data and errors

- Is `clientLoader` the only native data entry point, or should a shared loader
  function be inferred when no native loader is declared?
- Which loader results should be cached or revalidated during native navigation?
- Should redirects use web-compatible `Response` objects, a native result type,
  or both?
- How are native error boundaries typed and selected for a failed parent route?

## Packaging and versions

- Should the native runtime be exported from `flamefront/nativescript`, or from
  a separate package with an explicit NativeScript peer dependency?
- Should the shared manifest and matcher move into a small internal/core
  package before the native adapter is public?
- Which Octane and NativeScript Vite versions form the first supported matrix?

## Decision rule

Prefer the choice that keeps one manifest and one matcher, gives the native host
sole authority over physical navigation, and makes browser dependencies
unrepresentable in the native entry graph. Defer choices that are only needed
for tabs, retention, or transition customization until the single-stack canary
provides evidence.
