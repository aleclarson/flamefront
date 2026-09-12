# Create a one-page app

> Set up one server-rendered Octane page and confirm that its loader result
> reaches the HTML response.

This guide assumes basic TypeScript and terminal use. If you are still deciding
whether Flamefront fits, start with [the included-app trial](getting-started.md).
You do not need prior TSRX experience to copy this example.

## Create the project

Use Node.js 26 or newer. Create a project with pnpm:

```sh
pnpm create flamefront@latest my-app
cd my-app
```

The creator selects compatible Flamefront, Octane, TypeScript, and Vite
versions and installs them. `npm create flamefront@latest my-app`,
`yarn create flamefront my-app`, and `bun create flamefront my-app` are also
supported. Pass `--no-install` after the directory to create the files without
installing dependencies.

The target directory must be empty and its name must be a valid lowercase npm
package name. The creator will not merge with or overwrite an existing app.

## Inspect the application files

The creator writes this layout:

```
.
├── .gitignore
├── index.html
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── vite.config.ts
└── src
    ├── AppShell.tsrx
    ├── HomePage.tsrx
    ├── app.ts
    ├── entry-server.ts
    ├── env.d.ts
    ├── main.ts
    └── styles.css
```

`vite.config.ts` configures Flamefront before the Octane plugin:

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { octane } from "@octanejs/vite-plugin"
import { flamefront } from "flamefront/vite"

export default defineConfig({
  plugins: [flamefront({ target: "node" }), octane()],
})
```

`src/app.ts` defines the shell and one server-rendered route:

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
  <div className="app-shell">
    <header>Flamefront</header>
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

  <main>
    <p className="eyebrow">Server-rendered with Flamefront</p>
    <h1>Your app is ready.</h1>
    <p>The loader handled {data.pathname}</p>
  </main>
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
import "./styles.css"

await startOctaneClient({ app })
```

`index.html` provides the document template and browser entry:

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

From `my-app`, run:

```sh
pnpm dev
```

Leave the process running and open <http://localhost:5173/>. The page should
show `Your app is ready.` and `The loader handled /`. The second line comes
from the route loader.
You have completed the example when both lines appear without a server error.
Stop the process with Ctrl+C.

To check the production build, run these commands one at a time. The build
replaces `dist/`; do not keep authored files there.

```sh
pnpm build
pnpm preview
```

Open <http://localhost:4173/> and check for the same text. Stop preview with
Ctrl+C. Build and preview do not run a TypeScript type check.

If the server cannot find `src/app.ts`, check that the terminal is in
`my-app`. For a busy development port, use `pnpm dev -- --port 5174` and open
that port instead.

Next, [choose how another route renders](routes.md), or read
[build and deployment](deployment.md) before hosting the app.
