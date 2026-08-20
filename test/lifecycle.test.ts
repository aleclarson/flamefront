import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { route } from '../src/index.ts';
import { prerenderStaticRoutes, staticRouteDataFile } from '../src/lifecycle.ts';

test('prerenders every supplied static route', async () => {
	const root = await mkdtemp(resolve(tmpdir(), 'flamefront-build-'));
	const clientDirectory = resolve(root, 'dist/client');
	const routes = [
		route('/docs', '/src/Docs.tsrx', { render: 'static' }),
		route('/about/team', '/src/Team.tsrx', { render: 'static' }),
	];

	try {
		await prerenderStaticRoutes(
			root,
			clientDirectory,
			routes,
			async (request) => `<main>${new URL(request.url).pathname}</main>`,
			async (request) => ({ pathname: new URL(request.url).pathname }),
		);

		assert.equal(
			await readFile(resolve(clientDirectory, 'docs/index.html'), 'utf8'),
			'<main>/docs</main>',
		);
		assert.equal(
			await readFile(resolve(clientDirectory, 'about/team/index.html'), 'utf8'),
			'<main>/about/team</main>',
		);
		assert.deepEqual(
			JSON.parse(await readFile(staticRouteDataFile(clientDirectory, routes[0]), 'utf8')),
			{ pathname: '/docs' },
		);
		assert.deepEqual(
			JSON.parse(await readFile(resolve(clientDirectory, 'about/team/index.data.json'), 'utf8')),
			{ pathname: '/about/team' },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('rejects parameterized static routes without concrete paths', async () => {
	const root = await mkdtemp(resolve(tmpdir(), 'flamefront-build-'));
	const parameterizedRoute = route('/articles/:slug', '/src/Article.tsrx', { render: 'static' });

	try {
		await assert.rejects(
			prerenderStaticRoutes(root, resolve(root, 'dist/client'), [parameterizedRoute], async () => ''),
			/without concrete paths/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('writes rendered static route data without running a fallback loader', async () => {
	const root = await mkdtemp(resolve(tmpdir(), 'flamefront-build-'));
	const clientDirectory = resolve(root, 'dist/client');
	const staticRoute = route('/built', '/src/Built.tsrx', { render: 'static' });
	let fallbackCalls = 0;

	try {
		await prerenderStaticRoutes(
			root,
			clientDirectory,
			[staticRoute],
			async () => ({ html: '<main>built</main>', routeData: { source: 'render' } }),
			async () => {
				fallbackCalls += 1;
				return { source: 'fallback' };
			},
		);

		assert.equal(fallbackCalls, 0);
		assert.deepEqual(
			JSON.parse(await readFile(staticRouteDataFile(clientDirectory, staticRoute), 'utf8')),
			{ source: 'render' },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
