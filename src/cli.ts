#!/usr/bin/env node

import { binary, command, flag, run, subcommands } from '@alloc/cmd-ts';
import { buildProject, devProject, loadProject, previewProject } from './lifecycle.ts';

const routes = command({
	name: 'routes',
	aliases: ['route'],
	description: 'List the centralized route manifest for the current app.',
	args: {
		json: flag({
			long: 'json',
			description: 'Print the manifest as JSON.',
		}),
	},
	async handler({ json }) {
		const { app } = await loadProject();
		if (json) {
			console.log(JSON.stringify(app.routes, null, 2));
			return;
		}

		for (const route of app.routes) {
			const hydration =
				typeof route.hydration === 'object'
					? JSON.stringify(route.hydration)
					: (route.hydration ?? 'default');
			console.log(`${route.path}\t${route.render}\t${hydration}`);
		}
	},
});

const dev = command({
	name: 'dev',
	description: 'Start the development server for every render mode.',
	args: {},
	handler: () => devProject(),
});

const build = command({
	name: 'build',
	description: 'Build client and server bundles, then prerender SSG routes.',
	args: {},
	handler: () => buildProject(),
});

const preview = command({
	name: 'preview',
	description: 'Serve a production build locally.',
	args: {},
	handler: () => previewProject(),
});

const cli = subcommands({
	name: 'ff',
	version: '0.0.0',
	description: 'Flamefront, a small compiler-oriented framework for Octane.',
	cmds: { build, dev, preview, routes },
});

await run(binary(cli), process.argv);
