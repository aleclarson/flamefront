import assert from 'node:assert/strict';
import test from 'node:test';
import { defineApp, layout, route } from '../src/index.ts';
import {
	flamefront,
	generateDeferredRoute,
	generateRemixRoutes,
	remixRoutesId,
	stripRouteLoader,
} from '../src/vite.ts';

test('masks a route loader while preserving source offsets', () => {
	const source = `import { value } from './server.ts';

export async function loader({ request }) {
	const data = { nested: true };
	return \`\${request.url}:\${JSON.stringify(data)}\`;
}

export default function Route() @{
	<h1>Route</h1>
}
`;
	const transformed = stripRouteLoader(source);

	assert.equal(transformed.length, source.length);
	assert.equal(transformed.split('\n').length, source.split('\n').length);
	assert.doesNotMatch(transformed, /request\.url|nested: true/);
	assert.match(transformed, /export default function Route/);
});

test('leaves modules without a loader unchanged', () => {
	const source = 'export default function Route() {}';
	assert.equal(stripRouteLoader(source), source);
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
	assert.match(source, /virtual:flamefront\/deferred-route\?entry=%2Fsrc%2FServer\.tsrx/);
	assert.match(source, /handle: \{ flamefront: \{"render":"ssr","hydration":"deferred"\} \}/);
	assert.doesNotMatch(source, /deferred-route\?entry=%2Fsrc%2FClient/);
});

test('generates an Octane deferred hydration component boundary', () => {
	const source = generateDeferredRoute('/src/Server.tsrx');
	assert.match(source, /import \{ Hydrate \} from 'octane'/);
	assert.match(source, /interaction\(\{ events: 'click' \}\)/);
	assert.match(source, /<Component \{\.\.\.props\} \/>/);
});

test('resolves the public generated routes module and deferred TSRX modules', () => {
	const plugin = flamefront();
	const generatedId = plugin.resolveId(remixRoutesId);
	const deferredId = plugin.resolveId(
		'virtual:flamefront/deferred-route?entry=%2Fsrc%2FServer.tsrx',
	);

	assert.equal(generatedId, `\0${remixRoutesId}`);
	assert.equal(
		deferredId,
		'\0virtual:flamefront/deferred-route?entry=%2Fsrc%2FServer.tsrx.tsrx',
	);
});
