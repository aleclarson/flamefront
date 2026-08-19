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
		route('/home', '/src/Home.tsrx', { render: 'ssr' }),
	],
});
```

The manifest contains route behavior only. App-specific display data, such as
navigation labels, remains in app code.

Run `ff routes` from an app with `src/routes.ts` to inspect its route graph.
Production rendering and static output remain on the existing thin Octane
adapters.
