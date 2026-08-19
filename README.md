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

Place Flamefront's Vite transform before Octane's so loader bodies remain
server-only, including in production sourcemaps:

```ts
import { octane } from '@octanejs/vite-plugin';
import { flamefront } from 'flamefront/vite';

export default {
	plugins: [flamefront(), octane()],
};
```
