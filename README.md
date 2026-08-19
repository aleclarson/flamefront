# Flamefront

Flamefront is the small, compiler-oriented framework layer being explored for
the Octane playground. Its package sources, CLI, and tests run directly as
TypeScript through Node's built-in type stripping; there is no package build
step or duplicate declaration surface.

Routes are declared beside their Octane components:

```ts
import { defineRoute } from 'flamefront';

export function Home() @{
	<main>Home</main>
}

defineRoute(Home, {
	path: '/home',
	render: 'ssr',
});
```

The Vite plugin extracts and erases the declaration, then exposes the generated
route graph through `virtual:flamefront/routes`. Only static behavioral options
belong in `defineRoute()`; display data such as navigation labels stays in app
code.

`flamefront.config.json` supplies the discovery boundary used by both the Vite
plugin and CLI:

```json
{
	"routes": {
		"include": ["src/**/*.tsrx"]
	}
}
```

The JSON boundary is intentional: `ff routes` can discover the graph without
executing application or Vite configuration. The include pattern selects source
files only; paths still come exclusively from `defineRoute()`.

Add Flamefront alongside Octane's compiler plugin:

```ts
import { octane } from '@octanejs/vite-plugin';
import { flamefront } from 'flamefront/vite';

export default {
	plugins: [flamefront(), octane()],
};
```

Run `ff routes` to inspect the compiled route graph. Production rendering and
static output remain on the existing thin Octane adapters.
