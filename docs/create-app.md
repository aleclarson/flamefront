# Create a one-page app

> Set up one server-rendered Octane page and confirm that its loader result
> reaches the HTML response.

This guide assumes basic TypeScript and terminal use. If you are still deciding
whether Flamefront fits, start with [the included-app trial](getting-started.md).
You do not need prior TSRX experience to copy this example.

## Create an empty project

Use Node.js 26 or newer, pnpm 11, and an empty directory. These commands assume
a POSIX shell (for example, macOS Terminal or a Linux terminal). This example
uses a package built from the current Flamefront checkout; APIs and generated
output may change before 1.0. It uses Octane, a component renderer, rather than React or Preact.

Start at the root of the checkout used in [the trial](getting-started.md),
with its dependencies installed. Create a sibling directory and pack the
current source into it:

```sh
mkdir ../flamefront-example
pnpm pack --pack-destination ../flamefront-example
cd ../flamefront-example
```

The current checkout produces `flamefront-0.1.1.tgz`. Use this local archive
for the examples on this page so the installed API matches the reviewed source.
If the checkout's version changes, use the filename reported by `pnpm pack`
in the install command below.

Create `package.json`:

```json
{
  "name": "flamefront-example",
  "private": true,
  "type": "module"
}
```

Create `pnpm-workspace.yaml` to allow the build tool's esbuild installation
script. pnpm 11 requires this explicit setting:

```yaml
allowBuilds:
  esbuild: true
```

Install the matching packages:

```sh
pnpm add \
  ./flamefront-0.1.1.tgz \
  @octanejs/remix-router@0.1.48 \
  @octanejs/vite-plugin@0.1.54 \
  octane@0.2.7 \
  vite@8.3.0
```

## Add the application files

The `"type": "module"` setting enables JavaScript's `import`/`export` module
format. Create the `src` directory and the files below; no scaffolding command
creates them for you.

```sh
mkdir src
```

The complete layout is:

```
.
├── package.json
├── pnpm-workspace.yaml
├── index.html
├── vite.config.ts
└── src
    ├── app.ts
    ├── AppShell.tsrx
    ├── HomePage.tsrx
    ├── entry-server.ts
    └── main.ts
```

Configure Vite with Flamefront before the Octane plugin:

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { octane } from "@octanejs/vite-plugin"
import { flamefront } from "flamefront/vite"

export default defineConfig({
  plugins: [flamefront({ target: "node" }), octane()],
})
```

Define the shell and a server-rendered route:

```ts
// src/app.ts
import { defineApp, serverRoute } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [serverRoute("/", "/src/HomePage.tsrx")],
})
```

The shell owns UI shared by every page. Its `<Outlet />` is where the current
route appears.

The two `.tsrx` files below use TSRX, TypeScript with template syntax compiled
by the Octane Vite plugin. In `function AppShell() @{ ... }`, the final JSX
element supplies the rendered result. Copy these examples into `.tsrx` files;
ordinary TypeScript does not parse the `@{` syntax.

```tsx
// src/AppShell.tsrx
import { Outlet } from "@octanejs/remix-router"

export default function AppShell() @{
  <div>
    <header>My app</header>
    <Outlet />
  </div>
}
```

A **loader** is a function that reads data for a route. This one returns the
requested path. `LoaderArgs<"/">` describes the inputs for the `/` route;
`useLoaderData<typeof loader>()` gives the component the loader's result.

```tsx
// src/HomePage.tsrx
import { useLoaderData } from "@octanejs/remix-router"
import type { LoaderArgs } from "flamefront/server"

export async function loader({ request }: LoaderArgs<"/">) {
  return { pathname: new URL(request.url).pathname }
}

export default function HomePage() @{
  const data = useLoaderData<typeof loader>()

  <main>Loaded at {data.pathname}</main>
}
```

## Connect server and browser rendering

The server entry connects the route loader runtime to Octane's HTML renderer.
`virtual:flamefront/server-routes` is a module supplied by the Vite plugin;
you do not create that file yourself. Keep the asset path as shown: in the
build, this entry lives in `dist/server` beside `dist/client`.

```ts
// src/entry-server.ts
import { importRoute } from "virtual:flamefront/server-routes"
import { createOctaneDocuments } from "flamefront/octane"
import { createRouteRuntime } from "flamefront/server"
import { createServerEntry } from "flamefront/entry"
import { app } from "./app.ts"

const runtime = createRouteRuntime({ app, importRoute })
const documents = createOctaneDocuments({ app, runtime })

export default createServerEntry({
  app,
  documents,
  assets: {
    clientDirectory: new URL("../client/", import.meta.url),
  },
})
```

Start the browser entry:

```ts
// src/main.ts
import { startOctaneClient } from "flamefront/octane/client"
import { app } from "./app.ts"

await startOctaneClient({ app })
```

Create `index.html` at the project root:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flamefront example</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## Run and verify

From `flamefront-example`, run:

```sh
pnpm exec ff dev
```

Leave the process running and open <http://localhost:5173/>. The page should
show `My app` and `Loaded at /`. The second line comes from the route loader.
You have completed the example when both lines appear without a server error.
Stop the process with Ctrl+C.

To check the production build, run these commands one at a time. The build
replaces `dist/`; do not keep authored files there.

```sh
pnpm exec ff build
pnpm exec ff preview
```

Open <http://localhost:4173/> and check for the same text. Stop preview with
Ctrl+C. Build and preview do not run a TypeScript type check.

If the server cannot find `src/app.ts`, check that the terminal is in
`flamefront-example`. For a busy development port, use
`pnpm exec ff dev --port 5174` and open that port instead.

Next, [choose how another route renders](routes.md), or read
[build and deployment](deployment.md) before hosting the app.
