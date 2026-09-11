# Flamefront

> Typed centralized route manifests for Octane.

Suppose your site has an About page that can be built ahead of time, product
pages that need fresh server data, and a workspace rendered in the browser.
Where do you describe those choices so that the server, browser router, and
build agree about each URL?

If your framework already handles that, you may not need Flamefront. If you
are building with **Octane**, a component renderer, Flamefront provides that
connection. A **route manifest** is a TypeScript list of URL patterns, page
files, and rendering choices. Flamefront uses it to build and serve the app.

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

| Your situation                                                               | What to consider                                                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| You want an Octane app with different rendering choices per URL.             | Flamefront connects those choices to the build, server, and browser router.                                      |
| Your existing framework already provides the routing and rendering you need. | Keeping it avoids a runtime migration and another dependency.                                                    |
| You need only static content.                                                | An existing static-site generator or plain HTML may already cover the job.                                       |
| You need only browser routing.                                               | A router may suffice; Flamefront also introduces build and server conventions.                                   |
| You want to keep your React or Preact runtime.                               | The documented Flamefront setup renders through Octane. This is not a drop-in router replacement for those apps. |
| You need a stable production framework or built-in form actions.             | This is an alpha; there is no action or mutation API.                                                            |

Flamefront does not supply your authentication policy, database layer, write
endpoints, or deployment infrastructure. A route loader reads data; your
application still owns what it can access and how writes work.

These docs describe the current repository checkout, whose package version
is `0.1.0-alpha.0`, and require Node.js 26 or newer. The published package with
that version has an older API; the setup guide uses a local package archive.
APIs and output can change before 1.0. The package uses
[FSL-1.1-MIT](../LICENSE.md); review the license before adoption.

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
| [Build and deploy](deployment.md)                                           | What commands and artifacts does my host need?                   | A working app; basic hosting knowledge                   | Check a production build and select the files and runtime to serve. |
| [Migrate an existing app to Octane and Flamefront](brownfield-migration.md) | What must change for a full cutover?                             | Existing app ownership and a successful Flamefront trial | Inventory migration work and define acceptance checks.              |
