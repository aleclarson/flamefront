import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { defineApp, layout, route } from '../src/index.ts';
import {
	flamefront,
	generateHydrationRoute,
	generateRemixRoutes,
	omitRouteSourceContent,
	remixRoutesId,
	removeServerRouteExports,
} from '../src/vite.ts';

const routeSource = { entry: '/src/Route.tsrx' };

async function createTestPlugins() {
	const root = await mkdtemp(path.join(tmpdir(), 'flamefront-vite-'));
	await mkdir(path.join(root, 'src'));
	await writeFile(
		path.join(root, 'src/app.ts'),
		`export const app = {
	shell: '/src/AppShell.tsrx',
	routeTree: [],
	routes: [{ entry: '/src/Route.tsrx' }],
};
`,
	);
	const [frameworkPlugin, routePlugin] = flamefront();
	frameworkPlugin.configResolved({ root });
	routePlugin.configResolved({ root });
	const clientContext = {
		environment: { config: { consumer: 'client' } },
		resolve: async (id: string) => ({ id: path.join(root, 'src', id.replace('./', '')) }),
	};
	return {
		clientContext,
		frameworkPlugin,
		root,
		routeId: path.join(root, 'src/Route.tsrx'),
		routePlugin,
		cleanup: () => rm(root, { recursive: true, force: true }),
	};
}

test('removes a loader and its private dependency graph', () => {
	const transformed = removeServerRouteExports(
		`import { serverValue } from './data.server.ts';
import { sharedValue } from './shared.ts';

const serverHelper = () => sharedValue(serverValue);
const clientHelper = () => sharedValue('client');

export async function loader() {
	return serverHelper();
}

export default function Route() {
	return clientHelper();
}
`,
		'/project/src/Route.tsrx',
	);

	assert.ok(transformed);
	assert.doesNotMatch(transformed.code, /serverValue|serverHelper|data\.server/);
	assert.match(transformed.code, /sharedValue/);
	assert.match(transformed.code, /clientHelper/);
	assert.match(transformed.code, /export default function Route/);
	assert.equal(transformed.map?.sources[0], '/project/src/Route.tsrx');
});

test('supports variable and aliased loader exports', () => {
	const variableLoader = removeServerRouteExports(
		`const privateHelper = () => 'private';
export const loader = () => privateHelper(), kept = 'client';
loader.cache = true;
export default kept;
`,
	);
	assert.ok(variableLoader);
	assert.doesNotMatch(variableLoader.code, /loader|privateHelper|cache/);
	assert.match(variableLoader.code, /kept/);

	const aliasedLoader = removeServerRouteExports(
		`const serverLoader = () => 'private';
serverLoader.cache = true;
export { serverLoader as loader };
export default function Route() {}
`,
	);
	assert.ok(aliasedLoader);
	assert.doesNotMatch(aliasedLoader.code, /serverLoader|cache|loader/);

	const reexportedLoader = removeServerRouteExports(
		`export { fetchData as loader } from './data.server.ts';
export default function Route() {}
`,
	);
	assert.ok(reexportedLoader);
	assert.doesNotMatch(reexportedLoader.code, /fetchData|data\.server|loader/);
});

test('preserves unrelated destructured exports', () => {
	const transformed = removeServerRouteExports(
		`export const { title } = { title: 'client' };
export function loader() { return 'server'; }
export default title;
`,
	);
	assert.ok(transformed);
	assert.match(transformed.code, /title/);
});

test('only transforms manifest route modules on the client', async () => {
	const testPlugins = await createTestPlugins();
	const { clientContext, routeId, routePlugin } = testPlugins;
	const source = `export function loader() { return 'server'; }
export default function Route() {}`;

	try {
		const transformed = await routePlugin.transform.call(clientContext, source, routeId);
		assert.ok(transformed);
		assert.doesNotMatch(transformed.code, /loader/);
		assert.equal(
			await routePlugin.transform.call(
				clientContext,
				source,
				path.join(testPlugins.root, 'src/NotARoute.tsrx'),
			),
			null,
		);
		assert.equal(
			await routePlugin.transform.call(
				{ ...clientContext, environment: { config: { consumer: 'server' } } },
				source,
				routeId,
			),
			null,
		);
	} finally {
		await testPlugins.cleanup();
	}
});

test('rejects server modules that remain in the client graph', async () => {
	const testPlugins = await createTestPlugins();
	const { clientContext, frameworkPlugin, routeId } = testPlugins;

	try {
		await assert.rejects(
			frameworkPlugin.resolveId.call(clientContext, './data.server.ts', routeId),
			/server-only module.*still referenced by client code/i,
		);
		assert.equal(
			await frameworkPlugin.resolveId.call(
				{ ...clientContext, environment: { config: { consumer: 'server' } } },
				'./data.server.ts',
				routeId,
			),
			null,
		);
	} finally {
		await testPlugins.cleanup();
	}
});

test('omits mixed route sources from emitted client source maps', () => {
	const sourceMap = {
		version: 3,
		sources: ['../../../src/Route.tsrx', '../../../src/shared.ts'],
		sourcesContent: [
			`export function loader() { return process.env.SECRET; }`,
			`export const shared = 'client';`,
		],
		mappings: '',
	};
	const bundle = {
		'assets/Route.js.map': {
			type: 'asset' as const,
			fileName: 'assets/Route.js.map',
			source: JSON.stringify(sourceMap),
		},
	};

	omitRouteSourceContent(bundle, [routeSource]);
	const transformed = JSON.parse(bundle['assets/Route.js.map'].source);
	assert.deepEqual(transformed.sourcesContent, [null, `export const shared = 'client';`]);
});

test('omits route sources from binary source-map assets', () => {
	const sourceMap = {
		version: 3,
		sources: ['../../../src/Route.tsrx'],
		sourcesContent: [`export function loader() { return 'server'; }`],
		mappings: '',
	};
	const bundle = {
		'assets/Route.js.map': {
			type: 'asset' as const,
			fileName: 'assets/Route.js.map',
			source: new TextEncoder().encode(JSON.stringify(sourceMap)),
		},
	};

	omitRouteSourceContent(bundle, [routeSource]);
	const transformed = JSON.parse(String(bundle['assets/Route.js.map'].source));
	assert.deepEqual(transformed.sourcesContent, [null]);
});

test('omits route sources from generated chunk maps', () => {
	const bundle = {
		'assets/Route.js': {
			type: 'chunk' as const,
			map: {
				sources: ['../../../src/Route.tsrx'],
				sourcesContent: [`export function loader() { return 'server'; }`],
			},
		},
	};

	omitRouteSourceContent(bundle, [routeSource]);
	assert.deepEqual(bundle['assets/Route.js'].map.sourcesContent, [null]);
});

test('generates an eager shell root with lazy layouts and route metadata', () => {
	const app = defineApp({
		shell: '/src/AppShell.tsrx',
		routes: [
			layout('/src/Shell.tsrx', [
				route('/client', '/src/Client.tsrx', { render: 'client' }),
			route('/server', '/src/Server.tsrx', {
				render: 'server',
				hydration: 'deferred',
			}),
			route('/visible', '/src/Visible.tsrx', {
				render: 'server',
				hydration: { when: 'visible', rootMargin: '200px' },
			}),
		]),
		],
	});
	const source = generateRemixRoutes(app);
	const layoutSource = source.slice(
		source.indexOf('lazy: async () => { const routeModule = await import("/src/Shell.tsrx")'),
		source.indexOf('path: "/client"'),
	);
	const loaders = source.match(
		/loader: import\.meta\.env\.SSR \? routeModule\.loader : loadRouteData/g,
	);

	assert.match(source, /import Shell from "\/src\/AppShell\.tsrx"/);
	assert.match(source, /Component: Shell/);
	assert.equal(source.match(/import Shell from "\/src\/AppShell\.tsrx"/g)?.length, 1);
	assert.match(source, /Component: Shell,\n\t\tchildren: \[/);
	assert.match(source, /lazy: async \(\) => \{ const routeModule = await import\("\/src\/Shell\.tsrx"\)/);
	assert.equal(source.match(/import\("\/src\/Shell\.tsrx"\)/g)?.length, 1);
	assert.doesNotMatch(layoutSource, /loader:/);
	assert.match(
		source,
		/import \{ loadRouteData, loadStaticRouteData \} from 'flamefront\/remix-router\/data'/,
	);
	assert.equal(loaders?.length, 1);
	assert.match(source, /loader: routeModule\.loader/);
	assert.match(source, /loader: loadRouteData/);
	assert.match(source, /children: \[/);
	assert.match(source, /path: "\/client"/);
	assert.match(source, /path: "\/server"/);
	assert.match(source, /\/@flamefront\/hydration-route\.tsrx\?entry=%2Fsrc%2FVisible\.tsrx/);
	assert.match(source, /handle: \{ flamefront: \{"render":"server","hydration":"deferred"\} \}/);
	assert.match(
		source,
		/handle: \{ flamefront: \{"render":"server","hydration":\{"when":"visible","rootMargin":"200px"\}\} \}/,
	);
	assert.doesNotMatch(source, /hydration-route\.tsrx\?entry=%2Fsrc%2FServer/);
	assert.doesNotMatch(source, /hydration-route\.tsrx\?entry=%2Fsrc%2FClient/);
	assert.match(source, /if \(import\.meta\.env\.SSR\).*Promise\.all/);
	assert.match(source, /const componentModule = await import\("\/@flamefront\/hydration-route/);
	assert.match(source, /if \(import\.meta\.env\.SSR\) return \{\}; const routeModule = await import\("\/src\/Client\.tsrx"\)/);
});

test('uses static artifacts for browser navigation and preserves static hydration boundaries', () => {
	const app = defineApp({
		shell: '/src/AppShell.tsrx',
		routes: [
			route('/about', '/src/About.tsrx', { render: 'static', hydration: 'none' }),
			route('/built-full', '/src/BuiltFull.tsrx', {
				render: 'static',
				hydration: 'full',
			}),
			route('/built-deferred', '/src/BuiltDeferred.tsrx', {
				render: 'static',
				hydration: 'deferred',
			}),
			route('/built-visible', '/src/BuiltVisible.tsrx', {
				render: 'static',
				hydration: { when: 'visible' },
			}),
		],
	});
	const source = generateRemixRoutes(app);

	assert.match(source, /loader: routeModule\.loader/);
	assert.match(source, /loader: loadStaticRouteData/);
	assert.match(source, /hydration-route\.tsrx\?entry=%2Fsrc%2FAbout\.tsrx/);
	assert.doesNotMatch(source, /hydration-route\.tsrx\?entry=%2Fsrc%2FBuiltFull\.tsrx/);
	assert.doesNotMatch(source, /hydration-route\.tsrx\?entry=%2Fsrc%2FBuiltDeferred\.tsrx/);
	assert.match(source, /hydration-route\.tsrx\?entry=%2Fsrc%2FBuiltVisible\.tsrx/);
});

test('generates Octane route boundaries for every framework-owned policy', () => {
	const cases = [
		['none', /never\(\)/],
		[{ when: 'idle', timeout: 500 } as const, /idle\(\{"timeout":500\}\)/],
		[
			{ when: 'visible', rootMargin: '200px', threshold: [0, 0.5] } as const,
			/visible\(\{"rootMargin":"200px","threshold":\[0,0\.5\]\}\)/,
		],
		[
			{ when: 'interaction', events: ['click', 'focusin'] } as const,
			/interaction\(\{"events":\["click","focusin"\]\}\)/,
		],
		[
			{ when: 'media', query: '(min-width: 60rem)' } as const,
			/media\("\(min-width: 60rem\)"\)/,
		],
	] as const;

	for (const [hydration, expression] of cases) {
		const source = generateHydrationRoute('/src/Server.tsrx', hydration);
		assert.match(source, /import \{ Hydrate \} from 'octane'/);
		assert.match(source, expression);
		assert.match(source, /<Component \{\.\.\.props\} \/>/);
	}
});

test('resolves the public generated routes module and hydration TSRX modules', async () => {
	const [plugin] = flamefront();
	const pluginContext = { resolve: async () => null };
	const generatedId = await plugin.resolveId.call(pluginContext, remixRoutesId);
	const hydrationRouteId = await plugin.resolveId.call(
		pluginContext,
		'/@flamefront/hydration-route.tsrx?entry=%2Fsrc%2FServer.tsrx&hydration=%7B%22when%22%3A%22visible%22%7D',
	);
	const extractedId = await plugin.resolveId.call(
		pluginContext,
		'./hydration-route.tsrx?octane-hydrate=0',
		hydrationRouteId as string,
	);

	assert.equal(generatedId, `\0${remixRoutesId}`);
	assert.equal(
		hydrationRouteId,
		'/@flamefront/hydration-route.tsrx?entry=%2Fsrc%2FServer.tsrx&hydration=%7B%22when%22%3A%22visible%22%7D',
	);
	assert.equal(
		extractedId,
		'/@flamefront/hydration-route.tsrx?entry=%2Fsrc%2FServer.tsrx&hydration=%7B%22when%22%3A%22visible%22%7D&octane-hydrate=0',
	);
});
