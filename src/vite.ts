import type { Plugin } from 'vite';
import { discoverRouteProject, extractRouteModule, FLAMEFRONT_CONFIG_FILE } from './discovery.ts';
import type { RouteDefinition } from './index.ts';

const VIRTUAL_ROUTES_ID = 'virtual:flamefront/routes';
const RESOLVED_VIRTUAL_ROUTES_ID = `\0${VIRTUAL_ROUTES_ID}`;

function virtualRoutesSource(routes: readonly RouteDefinition[]): string {
	return `const definitions = ${JSON.stringify(routes, null, 2)};
export const routes = Object.freeze(definitions.map(Object.freeze));
export const spaRoutes = Object.freeze(routes.filter((route) => route.render === 'spa'));
`;
}

function isOctaneComponent(file: string): boolean {
	return file.endsWith('.tsrx') || file.endsWith('.tsx');
}

export function flamefront(): Plugin {
	let root = process.cwd();

	return {
		name: 'flamefront',
		enforce: 'pre',
		configResolved(config) {
			root = config.root;
		},
		async buildStart() {
			const project = await discoverRouteProject(root);
			this.addWatchFile(project.configPath);
			for (const file of project.sourceFiles) this.addWatchFile(file);
		},
		resolveId(id) {
			return id === VIRTUAL_ROUTES_ID ? RESOLVED_VIRTUAL_ROUTES_ID : null;
		},
		async load(id) {
			if (id !== RESOLVED_VIRTUAL_ROUTES_ID) return null;
			return virtualRoutesSource((await discoverRouteProject(root)).routes);
		},
		transform(code, id) {
			const file = id.split('?')[0];
			if (!isOctaneComponent(file)) return null;
			const extracted = extractRouteModule(code, file, root);
			if (extracted.routes.length === 0) return null;
			return {
				code: extracted.code,
				map: null,
				meta: { 'flamefront:routes': extracted.routes },
			};
		},
		handleHotUpdate({ file, server }) {
			if (!isOctaneComponent(file) && !file.endsWith(FLAMEFRONT_CONFIG_FILE)) return;
			const routeModule = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ROUTES_ID);
			if (routeModule) server.moduleGraph.invalidateModule(routeModule);
			server.ws.send({ type: 'full-reload' });
			return [];
		},
	};
}
