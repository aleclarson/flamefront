import assert from 'node:assert/strict';
import test from 'node:test';
import { defineApp, route } from '../src/index.ts';
import { loadRouteData, loadStaticRouteData } from '../src/remix-route-data.ts';

const shell = '/src/AppShell.tsrx';

function useBrowserClient(context: test.TestContext): void {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: {},
	});
	context.after(() => {
		if (descriptor) {
			Object.defineProperty(globalThis, 'window', descriptor);
		} else {
			delete (globalThis as { window?: unknown }).window;
		}
	});
}

test('shares a live data prefetch with generated client route loaders', async (context) => {
	useBrowserClient(context);
	const originalFetch = globalThis.fetch;
	let requests = 0;
	globalThis.fetch = async (input) => {
		requests += 1;
		const endpoint = new URL(String(input));
		assert.equal(endpoint.pathname, '/__prefetch-live-data');
		assert.equal(endpoint.searchParams.get('url'), 'https://example.test/server-prefetch');
		return Response.json({ source: 'live' });
	};
	context.after(() => {
		globalThis.fetch = originalFetch;
	});

	const app = defineApp({
		shell,
		routing: { dataPath: '/__prefetch-live-data' },
		routes: [route('/server-prefetch', '/src/Server.tsrx', { render: 'server' })],
	});
	await app.prefetch('https://example.test/server-prefetch');

	assert.deepEqual(
		await loadRouteData({
			request: new Request('https://example.test/server-prefetch'),
		}, { dataPath: '/__prefetch-live-data' }),
		{ source: 'live' },
	);
	assert.equal(requests, 1);
});

test('prefetches static route data from the build artifact', async (context) => {
	useBrowserClient(context);
	const originalFetch = globalThis.fetch;
	let requests = 0;
	globalThis.fetch = async (input) => {
		requests += 1;
		assert.equal(String(input), 'https://example.test/static-prefetch/index.data.json');
		return Response.json({ source: 'static-artifact' });
	};
	context.after(() => {
		globalThis.fetch = originalFetch;
	});

	const app = defineApp({
		shell,
		routes: [route('/static-prefetch', '/src/Static.tsrx', { render: 'static' })],
	});
	await app.prefetch('https://example.test/static-prefetch');

	assert.deepEqual(
		await loadStaticRouteData({
			request: new Request('https://example.test/static-prefetch'),
		}),
		{ source: 'static-artifact' },
	);
	assert.equal(requests, 1);
});
