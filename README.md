# Flamefront

Flamefront is the small, compiler-oriented framework layer being explored for
the Octane playground. Its package sources, CLI, and tests run directly as
TypeScript through Node's built-in type stripping; there is no package build
step or duplicate declaration surface.

The app owns one explicit, centralized route manifest:

```ts
import { defineApp, layout, route } from 'flamefront';

export const app = defineApp({
	routes: [
		layout('/src/ArticleShell.tsrx', [
			route('/articles/:slug', '/src/Article.tsrx', { render: 'ssr' }),
		]),
	],
});
```

`layout(module, children)` creates a pathless layout group. `app.routeTree`
retains that authored nesting for compiler integrations, while `app.routes`
is the normalized leaf collection used for matching, filtering, static output,
and CLI inspection.

The manifest contains route behavior only. App-specific display data, such as
navigation labels, remains in app code.

Use `app.match(url)` to select the most specific route and read decoded
parameters. Pass `{ render: 'spa' }` to select only routes with a particular
render mode. Flamefront delegates route grammar and specificity to
`@remix-run/route-pattern` rather than maintaining its own matcher.

Run `ff routes` from an app with `src/routes.ts` to inspect its route graph.
Production rendering and static output remain on the existing thin Octane
adapters.

## Route loaders

A manifest entry is a route module. It may export a server loader alongside
its default component:

```ts
import type { LoaderArgs } from 'flamefront/server';

export async function loader({ request, params }: LoaderArgs) {
	return { pathname: new URL(request.url).pathname, id: params.id };
}

export default function Route({ loaderData }) {
	// Render with data resolved before the component renders.
}
```

Server adapters call `loadRoute()` from `flamefront/server`. Browser routers
can call `app.load(url)` from their route loaders, while `app.prefetch(url)`
warms the same deduplicated cache on link intent.

Flamefront's Vite transform loads the centralized route manifest. Octane
compiles TSRX first, then Flamefront removes loaders and their private
dependency graph from client modules while retaining them in server modules:

```ts
import { octane } from '@octanejs/vite-plugin';
import { flamefront } from 'flamefront/vite';

export default {
	plugins: [flamefront(), octane()],
};
```

Files and directories named `.server` are rejected if they remain reachable
from client code after loader removal. This turns accidental server imports into
compile-time errors in both development and production.

When client source maps are emitted, mixed route sources omit embedded
`sourcesContent` so removed server implementations are not republished in map
files. The generated client code remains mapped, but developer tools need local
source access to display those route sources.

## Remix Router adapter

Applications that install `@octanejs/remix-router` can opt into Flamefront's
Remix adapter. Flamefront keeps that package as an optional peer, so core route
configuration and matching remain router-agnostic.

The Vite plugin generates the application's nested, lazy route-object graph at
`virtual:flamefront/remix-routes`. Most applications can use the stable adapter
instead; it creates a browser router or a request-scoped static router over the
same graph:

```ts
import {
	createClientRouter,
	createServerRouter,
	routes,
} from 'flamefront/remix-router';

const browserRouter = createClientRouter({ hydrationData });
const serverResult = await createServerRouter(request);
if (serverResult instanceof Response) return serverResult;
```

The server result contains `router`, `context`, and serializable
`hydrationData`. Redirect responses are returned directly and route errors stay
in both the static context and hydration state. The exported `routes` collection
is available when an application needs lower-level Remix Router APIs.

Route modules and pathless layout modules use default component exports and are
loaded lazily. Server routers call route modules' exported loaders directly;
browser routers use Flamefront's route-data endpoint with navigation abort
signals and HTTP error handling. A route marked `hydration: 'deferred'` receives a generated
Octane interaction boundary around its component; layouts remain immediately
interactive.
