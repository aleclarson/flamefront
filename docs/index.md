# Flamefront

> Typed centralized route manifests for Octane.

Flamefront gives Octane projects routing and a choice of pre-rendering,
server-side rendering (SSR), or client-side rendering (CSR). Use the mode
your project needs today, with the flexibility to choose another as its
requirements evolve. A project can use just one mode throughout.

That flexibility also lets you use one framework across many or all of your
Octane projects: a static documentation site, a server-rendered storefront,
and a browser-rendered workspace can share the same framework conventions.
Mix modes within a project when useful; using every mode is never a goal.

A **route manifest** is a TypeScript list of URL patterns, page files, and
rendering choices. Flamefront uses it to connect Octane, a component renderer,
to the build, server, and browser router.

For writes, [typed server actions and forms](forms-and-mutations.md) connect
server validation to native or enhanced submissions. For static sites,
[incremental prerendering](incremental-prerendering.md) reuses cached page
content while assembling a complete deployment on every build.

## What does that produce?

The included app has this entry in `playground/src/app.ts` (excerpt):

```ts
route("/about", "/src/AboutPage.tsrx", {
  render: "static",
  hydration: "none",
})
```

This says to generate `/about` at build time and leave that page's HTML
non-interactive. The shared shell can still be interactive. `.tsrx` is Octane's
template source format; you do not need to learn its syntax for this trial.

From the repository root, after installing its dependencies:

```sh
pnpm build
```

The build reports, among other output:

```text
Generated dist/client/about/index.html.
```

That path is relative to the included app, `playground/`. Its generated
`playground/dist/client/about/index.data.json` contains:

```json
{ "message": "Generated /about during ff build." }
```

You can inspect the HTML and the saved data before starting a server. This
lets you check which content was generated at build time.

## Is it relevant to your app?

| Your situation                                                               | What to consider                                                                                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| You want rendering flexibility in an Octane app.                             | Use one mode throughout or choose per URL as requirements evolve.                                                    |
| Your existing framework already provides the routing and rendering you need. | Keeping it avoids a runtime migration and another dependency.                                                        |
| You need only static content.                                                | Use static routes; keep the same framework if another project needs SSR or CSR.                                      |
| You need only browser routing.                                               | Use client routes; the same framework supports projects that need pre-rendering or SSR.                              |
| You want to keep your React or Preact runtime.                               | The documented Flamefront setup renders through Octane. This is not a drop-in router replacement for those apps.     |
| You need server-backed form actions and mutations.                           | Use the [forms and mutations guide](forms-and-mutations.md); static-only hosting still needs a write-capable server. |

Flamefront supplies action dispatch, while your application owns authentication,
authorization, persistence, and deployment infrastructure. A route loader reads
data; your application still owns what it can access and how writes work.

These docs describe the current repository checkout, whose package version
is `0.1.1`, and require Node.js 26 or newer. The setup guide uses a local
package archive to keep the examples and installed source together.
APIs and output can change before 1.0. The package is licensed under [MIT](../LICENSE.md).

## Try it, then choose a next step

Start with [Build and inspect the included app](getting-started.md). It gives
you prerequisites, commands, and a visible success condition without changing
an existing application. Deciding that you do not need this tool is a useful
result of the trial.

After that, choose the page that answers your next question:

| Page                                                                        | Reader question                                                  | Assumes                                                  | Outcome                                                             |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| [Build and inspect the included app](getting-started.md)                    | What does a build actually produce?                              | Basic terminal use                                       | Inspect generated HTML and run it locally.                          |
| [Create a one-page app](create-app.md)                                      | How do I wire up my own app?                                     | Basic TypeScript and terminal use                        | Run one page with server-loaded data.                               |
| [Choose route rendering and data behavior](routes.md)                       | Which parts run at build time, on the server, or in the browser? | A working app and its manifest                           | Choose a route mode and understand its limits.                      |
| [Forms and mutations](forms-and-mutations.md)                               | How do forms and direct action calls reach the server?           | A working server-backed route                            | Add typed writes, native forms, and enhanced submissions.           |
| [Build and deploy](deployment.md)                                           | What commands and artifacts does my host need?                   | A working app; basic hosting knowledge                   | Check a production build and select the files and runtime to serve. |
| [Migrate an existing app to Octane and Flamefront](brownfield-migration.md) | What must change for a full cutover?                             | Existing app ownership and a successful Flamefront trial | Inventory migration work and define acceptance checks.              |

For repeated static builds, [Reuse static pages between builds](incremental-prerendering.md)
shows how to enumerate content routes and verify cache reuse.
