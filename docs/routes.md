# Choose route rendering and data behavior

> Decide when a page's HTML and data are produced, then decide whether its
> rendered HTML needs browser interactivity.

This page assumes you have [a working app](create-app.md) and can edit its
`src/app.ts` manifest. It explains the choices; use editor navigation into
the exported TypeScript types when you need exact option shapes.

## Choose when the page is rendered

Choose the mode each page needs. All routes can use the same mode; the mixed
example below illustrates the available choices, not a required app structure.
You can adopt another mode later if your requirements change.

| Mode     | HTML for a direct visit                                      | Use when                                        | Boundary                                                                         |
| -------- | ------------------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `server` | Rendered for the request                                     | The page needs request-specific or current data | Requires a server at runtime.                                                    |
| `static` | Generated during `ff build`                                  | The same build-time content can serve visitors  | Requires a concrete path and a rebuild to update generated content.              |
| `client` | The server supplies the shell; the browser renders the route | The route should render in the browser          | Requires browser JavaScript; it does not make server loaders run in the browser. |

For example, after creating the referenced page files, a manifest can contain:

```ts
import { clientRoute, defineApp, serverRoute, staticRoute } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [
    serverRoute("/", "/src/HomePage.tsrx"),
    staticRoute("/about", "/src/AboutPage.tsrx"),
    clientRoute("/workspace", "/src/WorkspacePage.tsrx"),
  ],
})
```

Each route file exports its page component as the default export. Paths such
as `/src/HomePage.tsrx` are module paths relative to the Vite project root,
not filesystem-absolute paths. The aliases above are equivalents of
`route(path, entry, { render: "server" })`, and so on. Plain `route()` defaults
to `server` rendering.

Run `pnpm exec ff routes` from your app directory to inspect the resolved
choices. It prints URL pattern, render mode, and hydration policy:

```text
/          server  full
/about     static  full
/workspace client  full
```

Whitespace is shown as spaces here; the CLI separates columns with tabs.

## Read data without moving writes into loaders

A route's exported `loader` reads its data. The loader receives the request,
route parameters, and application-provided context. For `/products/:id`, the
`:id` segment captures a value from the URL:

```ts
import type { LoaderArgs } from "flamefront/server"

export async function loader({ params }: LoaderArgs<"/products/:id">) {
  return { productId: params.id }
}
```

At `/products/42`, this returns `{ productId: "42" }`. A server route runs its
loader for live requests; a static route saves its build-time result. Client
routes can request loader data from the server. A `client` rendering choice
does not make a data-backed app suitable for static hosting.

Flamefront removes `loader` exports and dependencies used only by them from
client route builds. A `.server` module still reachable from browser code is
a build error. Keep authentication and authorization checks in your server
code; removing code from a bundle does not establish an access policy.

For server-backed writes, add a page `action` and a callable action in a
`*.server.ts` module. The page action reads `request.formData()` and explicitly
maps fields to the callable action. Read the [forms and mutations guide](forms-and-mutations.md)
for native forms, enhanced `<Form>` submissions, and direct calls. A loader
should remain read-only.

## Choose browser interactivity separately

**Hydration** connects browser code to already-rendered HTML so that its
components can respond to interaction. It is separate from when the HTML is
generated: a static page can be interactive.

The shell and server/static routes default to `full` hydration. Keep that
default while establishing correct behavior. Use `none` when a region should
remain non-interactive, or a trigger object when it should activate later:

```ts
serverRoute("/products/:id", "/src/ProductPage.tsrx", {
  hydration: { when: "interaction", events: ["click", "focusin"] },
})
```

This is an entry inside a manifest with `serverRoute` imported. Other trigger
choices include `idle`, `visible`, and `media`. The `deferred` setting supports
authored hydration boundaries. These are optional controls, not prerequisites
for using routes. Client routes accept only `full` hydration.

See the [included app's hydration examples](../playground/README.md) for
working boundaries and the exported `HydrationMode` type in
[`src/index.ts`](../src/index.ts) for exact trigger fields.

## Share UI or generate content routes

Use `layout(entry, children)` to group routes under shared UI without adding a
URL segment. The shell provides app-wide UI, while a layout applies to its
branch. Both render an `Outlet` where child content belongs.

For Markdown pages, `markdownRoute()` selects static Markdown content. The
Flamefront Vite plugin includes Markdown support. For a directory of pages:

```ts
import { defineApp, glob, markdownRoute } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: glob("/src/docs/**/*.md", (file) =>
    markdownRoute(file.routePath("/docs"), file.path),
  ),
})
```

Create the shell and Markdown files before using this example. `index.md`
maps to its containing directory. Static routes cannot contain unresolved
`:` or `*` segments: provide concrete entries or use server rendering.

For apps mounted under a URL prefix, `routing.basename` and `routing.dataPath`
on `defineApp` configure the shared route prefix and data endpoint. Their
defaults are `/` and `/__flamefront/data`. Set these together with your host's
path rules; see [deployment checks](deployment.md#check-your-host).
