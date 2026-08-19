import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { defineApp, layout, route } from '../src/index.ts';
import {
	flamefront,
	generateDeferredRoute,
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
		path.join(root, 'src/routes.ts'),
		`export const app = {
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

test('generates one lazy Remix graph with nested layouts and route metadata', () => {
	const app = defineApp({
		routes: [
			layout('/src/Shell.tsrx', [
				route('/client', '/src/Client.tsrx', { render: 'spa' }),
				route('/server', '/src/Server.tsrx', {
					render: 'ssr',
					hydration: 'deferred',
				}),
			]),
		],
	});
	const source = generateRemixRoutes(app);
	const layoutSource = source.slice(source.indexOf('lazy:'), source.indexOf('children:'));
	const loaders = source.match(
		/loader: import\.meta\.env\.SSR \? routeModule\.loader : loadRouteData/g,
	);

	assert.match(source, /import\("\/src\/Shell\.tsrx"\)/);
	assert.equal(source.match(/import\("\/src\/Shell\.tsrx"\)/g)?.length, 1);
	assert.doesNotMatch(layoutSource, /loader:/);
	assert.match(source, /import \{ loadRouteData \} from 'flamefront\/remix-router\/data'/);
	assert.equal(loaders?.length, 2);
	assert.match(source, /children: \[/);
	assert.match(source, /path: "\/client"/);
	assert.match(source, /path: "\/server"/);
	assert.match(source, /\/@flamefront\/deferred-route\.tsrx\?entry=%2Fsrc%2FServer\.tsrx/);
	assert.match(source, /handle: \{ flamefront: \{"render":"ssr","hydration":"deferred"\} \}/);
	assert.doesNotMatch(source, /deferred-route\?entry=%2Fsrc%2FClient/);
});

test('generates an Octane deferred hydration component boundary', () => {
	const source = generateDeferredRoute('/src/Server.tsrx');
	assert.match(source, /import \{ Hydrate \} from 'octane'/);
	assert.match(source, /interaction\(\{ events: 'click' \}\)/);
	assert.match(source, /<Component \{\.\.\.props\} \/>/);
});

test('resolves the public generated routes module and deferred TSRX modules', async () => {
	const [plugin] = flamefront();
	const pluginContext = { resolve: async () => null };
	const generatedId = await plugin.resolveId.call(pluginContext, remixRoutesId);
	const deferredId = await plugin.resolveId.call(
		pluginContext,
		'/@flamefront/deferred-route.tsrx?entry=%2Fsrc%2FServer.tsrx',
	);
	const hydrationId = await plugin.resolveId.call(
		pluginContext,
		'./deferred-route.tsrx?octane-hydrate=0',
		deferredId as string,
	);

	assert.equal(generatedId, `\0${remixRoutesId}`);
	assert.equal(
		deferredId,
		'/@flamefront/deferred-route.tsrx?entry=%2Fsrc%2FServer.tsrx',
	);
	assert.equal(
		hydrationId,
		'/@flamefront/deferred-route.tsrx?entry=%2Fsrc%2FServer.tsrx&octane-hydrate=0',
	);
});
