# Flamefront

Flamefront is the small, compiler-oriented framework layer being explored for
the Octane playground. Its package sources, CLI, and tests run directly as
TypeScript through Node's built-in type stripping; there is no package build
step or duplicate declaration surface.

The app owns one explicit, centralized route manifest:

```ts
import { defineApp, route } from 'flamefront';

export const app = defineApp({
	routes: [
		route('/articles/:slug', '/src/Article.tsrx', { render: 'ssr' }),
	],
});
```

The manifest contains route behavior only. App-specific display data, such as
navigation labels, remains in app code.

Use `app.match(url)` to select the most specific route and read decoded
parameters. Pass `{ render: 'spa' }` to select only routes with a particular
render mode. Flamefront delegates route grammar and specificity to
`@remix-run/route-pattern` rather than maintaining its own matcher.

Run `ff routes` from an app with `src/routes.ts` to inspect its route graph.
Production rendering and static output remain on the existing thin Octane
adapters.
