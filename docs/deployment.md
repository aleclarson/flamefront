# Build and deploy

> Identify the generated files and runtime your application needs, and verify
> a production build before sending it to a host.

This page assumes a working [one-page setup](create-app.md) and basic
familiarity with your host. Examples run from the app directory and use the
setup's `flamefront({ target: "node" })` Vite plugin configuration.

## Commands and output

| Command                | Result                                                   | Important detail                                                            |
| ---------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm exec ff dev`     | Starts the development server                            | Port 5173 by default; accepts `--port`.                                     |
| `pnpm exec ff routes`  | Prints path, render mode, and hydration policy           | Add `--json` for route objects. Reads `src/app.ts`.                         |
| `pnpm exec ff typegen` | Generates route import types                             | Vite startup/build also generates these types.                              |
| `pnpm exec ff build`   | Builds browser/server bundles and generates static pages | Replaces the app's `dist/` directory. Does not run a TypeScript type check. |
| `pnpm exec ff preview` | Serves the production build locally                      | Build first. Port 4173 by default; use `PORT` to change it.                 |

For the repository's included app, root scripts such as `pnpm build` forward
to `playground/`. The direct `ff` commands above instead use your current app
directory.

Run the build and then preview it:

```sh
pnpm exec ff build
pnpm exec ff preview
```

Open <http://localhost:4173/>. For the one-page example, expect `My app` and
`Loaded at /`. Stop preview with Ctrl+C.

The build writes:

| Path                    | Contents                                                       |
| ----------------------- | -------------------------------------------------------------- |
| `dist/client/`          | Browser assets, the HTML template, and generated static routes |
| `dist/server/server.js` | Built server entry                                             |
| `dist/server/`          | Server chunks and a copy of the HTML template                  |

A static `/about` route also produces `about/index.html`,
`about/index.data.json`, `about/index.fragment.html`, and
`about/index.fragment.json` under `dist/client/`. The fragment files contain
the HTML and metadata used to update routed content during browser navigation.
Keep them with the page and browser assets.

## Choose a host boundary

An app containing live server routes or route-data requests needs a server.
Keep `dist/client` and `dist/server` together; the setup's server entry locates
the client directory relative to its built location. Client-rendered routes
also use the documented server setup. Do not assume that browser rendering
alone makes an app statically deployable.

A static host is suitable when every deployed route is covered by generated
static output and no runtime server behavior is required. Configure the host
to serve the directory paths and all associated artifacts. A successful local
preview does not check those host rules.

The Vite plugin's `target: "node"` selects the built-in srvx adapter, which
hosts HTTP requests and assets. `deno` and `bun` are also target values. When
`target` is omitted, the plugin generates a Web Fetch entry: the host receives
a `Request` and returns a `Response`, and you must supply the appropriate
asset access. These are alternative host integrations, not a change to the
Node 26+ prerequisite for the documented CLI workflow.

Use the exported options in [`flamefront/entry`](../src/entry.ts),
[`flamefront/fetch`](../src/fetch.ts), and
[`flamefront/output`](../src/output.ts) for custom composition. The first-run
guide verifies the Node setup; it is not a deployment recipe for every host.

## Check your host

Before deployment, verify the production build against the URLs people use:

- Load and refresh a nested URL directly; do not test only navigation from `/`.
- Check static HTML, data, fragments, and assets at their deployed paths.
- Test loader authentication, redirects, missing pages, and error responses.
- If using a prefix, keep `routing.basename`, `routing.dataPath`, proxy rules,
  and asset paths consistent.
- Run your application's type checks and behavior tests separately from the build.

Keep database clients, write endpoints, request context, middleware, and
response policies under application ownership. For an existing application,
the [migration guide](brownfield-migration.md) provides a fuller cutover list.
