#!/usr/bin/env node

import { binary, command, flag, run, subcommands } from '@alloc/cmd-ts';
import { discoverRoutes } from './discovery.ts';

const routes = command({
	name: 'routes',
	aliases: ['route'],
	description: 'List the compile-time route graph for the current app.',
	args: {
		json: flag({
			long: 'json',
			description: 'Print the manifest as JSON.',
		}),
	},
	async handler({ json }) {
		const routes = await discoverRoutes();
		if (json) {
			console.log(JSON.stringify(routes, null, 2));
			return;
		}

		for (const route of routes) {
			console.log(`${route.path}\t${route.render}\t${route.hydration ?? 'default'}`);
		}
	},
});

const cli = subcommands({
	name: 'ff',
	version: '0.0.0',
	description: 'Flamefront, a small compiler-oriented framework for Octane.',
	cmds: { routes },
});

await run(binary(cli), process.argv);
