import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { route } from '../src/index.ts';
import { prerenderStaticRoutes } from '../src/lifecycle.ts';

test('prerenders every supplied SSG route', async () => {
	const root = await mkdtemp(resolve(tmpdir(), 'flamefront-build-'));
	const clientDirectory = resolve(root, 'dist/client');
	const routes = [
		route('/docs', '/src/Docs.tsrx', { render: 'ssg' }),
		route('/about/team', '/src/Team.tsrx', { render: 'ssg' }),
	];

	try {
		await prerenderStaticRoutes(root, clientDirectory, routes, async (request) => {
			return `<main>${new URL(request.url).pathname}</main>`;
		});

		assert.equal(
			await readFile(resolve(clientDirectory, 'docs/index.html'), 'utf8'),
			'<main>/docs</main>',
		);
		assert.equal(
			await readFile(resolve(clientDirectory, 'about/team/index.html'), 'utf8'),
			'<main>/about/team</main>',
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('rejects parameterized SSG routes without concrete paths', async () => {
	const root = await mkdtemp(resolve(tmpdir(), 'flamefront-build-'));
	const parameterizedRoute = route('/articles/:slug', '/src/Article.tsrx', { render: 'ssg' });

	try {
		await assert.rejects(
			prerenderStaticRoutes(root, resolve(root, 'dist/client'), [parameterizedRoute], async () => ''),
			/without concrete paths/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
