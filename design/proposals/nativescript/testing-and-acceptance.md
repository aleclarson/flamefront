# NativeScript testing and acceptance

> Define the evidence required to show that NativeScript is another projection
> of the Flamefront route model rather than a second, drifting router.

## Core ideas

- Shared matcher tests prove that web and native resolve URLs identically.
- Native runtime tests use a fake host and do not require a device for every
  route-state assertion.
- Bundle tests prove that native output has no DOM, SSR, or browser-router path.
- A small single-stack canary should precede tabs, retention, and advanced
  lifecycle features.
- Existing browser tests remain a regression gate throughout the work.

## Matcher conformance

Run the same cases against the shared matcher and both projections:

| Case             | Expected evidence                             |
| ---------------- | --------------------------------------------- |
| Static path      | Same leaf route and empty params.             |
| Dynamic segment  | Same route and decoded param.                 |
| Nested layouts   | Same ordered match chain.                     |
| Optional segment | Same acceptance and params.                   |
| Splat route      | Same remaining pathname behavior.             |
| Basename         | Same normalized URL and generated href.       |
| Relative link    | Same destination from the same route context. |
| Unmatched path   | Same not-found classification.                |

The test should compare route IDs and params, not platform component objects.

## Native runtime tests

Use a fake `NativeNavigationHost` and test:

- initial deep-link preparation;
- parent-to-leaf `clientLoader` ordering;
- aborting superseded navigation;
- redirect before host commit;
- nearest error-boundary selection;
- nested `Outlet` rendering;
- push, replace, and back events;
- a host commit that resolves after a newer navigation;
- root unmount when a window closes.

These tests should run in the repository test environment. Device tests are
needed for actual `Frame` transitions, platform back behavior, and native view
events, but not for every route-matching case.

## Bundle tests

Build a minimal NativeScript fixture and assert that:

- the native route table contains only native entries;
- native route modules are lazy imports;
- the bundle has no `window` or `document` dependency;
- browser Remix Router, SSR, fragment, and hydration modules are absent;
- the native JSX renderer is selected for native TSX files.

Build the same fixture for the web projection and assert that its output and
existing browser behavior are unchanged.

## MVP acceptance

The first implementation is acceptable when a NativeScript app can:

1. start at a deep link;
2. match the same nested route chain as the web app;
3. render native shell/layout/leaf components through Octane;
4. load route data with cancellation;
5. navigate with push, replace, and back;
6. render a native error boundary and follow a redirect; and
7. build without browser or server-only dependencies.

Tabs, multiple named stacks, retained route branches, and transition
customization are outside the first acceptance target.
