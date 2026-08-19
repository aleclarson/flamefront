#!/usr/bin/env node

import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { binary, command, flag, run, subcommands } from '@alloc/cmd-ts';

async function loadApp() {
	const routesFile = resolve(process.cwd(), 'src/routes.ts');
	try {
		await access(routesFile);
	} catch {
		throw new Error(`Could not find ${routesFile}. Run ff from an app with src/routes.ts.`);
	}

	const module = await import(`${pathToFileURL(routesFile).href}?ff=${Date.now()}`);
	const app = module.app ?? module.default;
	if (!app || !Array.isArray(app.routes)) {
		throw new Error(`${routesFile} must export an app with a routes array.`);
	}
	return app;
}

const routes = command({
	name: 'routes',
	aliases: ['route'],
	description: 'List the explicit route manifest for the current app.',
	args: {
		json: flag({
			long: 'json',
			description: 'Print the manifest as JSON.',
		}),
	},
	async handler({ json }) {
		const app = await loadApp();
		if (json) {
			console.log(JSON.stringify(app.routes, null, 2));
			return;
		}

		for (const route of app.routes) {
			console.log(`${route.path}\t${route.render}\t${route.hydration ?? 'default'}`);
		}
	},
});

const cli = subcommands({
	name: 'ff',
	version: '0.0.0',
	description: 'Flamefront, a small code-based framework for Octane.',
	cmds: { routes },
});

await run(binary(cli), process.argv);
