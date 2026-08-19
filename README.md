# Flamefront

Flamefront is the small, code-based framework layer being explored for the
Octane playground.

The first slice deliberately owns only the route manifest contract:

```ts
import { defineApp, route } from 'flamefront';

export const app = defineApp({
	routes: [
		route('/home', '/src/Home.tsrx', { render: 'ssr' }),
	],
});
```

Run `ff routes` from an app with `src/routes.ts` to inspect its route graph.
Vite development, production rendering, and static output remain on the
existing Octane adapter until the manifest contract is ready to own them.
