import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { serve } from 'srvx';
import { defineApp, route } from '../src/index.ts';
import { createSrvxServer, loadRoute } from '../src/server.ts';

test('loads the matched route module with request parameters', async () => {
	const app = defineApp({
		routes: [route('/articles/:slug', '/src/Article.tsrx')],
	});
	const request = new Request('https://example.test/articles/hello%20world?preview=true');

	const loaded = await loadRoute(app, request, async (entry) => ({
		default: entry,
		loader: ({ request: loaderRequest, params, context }) => ({
			entry,
			pathname: new URL(loaderRequest.url).pathname,
			slug: params.slug,
			context,
		}),
	}), { source: 'test' });

	assert.deepEqual(loaded?.loaderData, {
		entry: '/src/Article.tsrx',
		pathname: '/articles/hello%20world',
		slug: 'hello world',
		context: { source: 'test' },
	});
});

test('returns null when no route matches', async () => {
	const app = defineApp({ routes: [route('/known', '/src/Known.tsrx')] });
	const loaded = await loadRoute(app, new Request('https://example.test/unknown'), async () => {
		throw new Error('An unmatched route must not be imported.');
	});

	assert.equal(loaded, null);
});

test('creates a srvx handler for every render mode', async () => {
	const root = await mkdtemp(resolve(tmpdir(), 'flamefront-srvx-'));
	const clientDirectory = resolve(root, 'client');
	await mkdir(resolve(clientDirectory, 'ssg'), { recursive: true });
	await writeFile(resolve(clientDirectory, 'index.html'), '<main>SPA shell</main>');
	await writeFile(resolve(clientDirectory, 'ssg/index.html'), '<main>Static page</main>');
	const app = defineApp({
		routes: [
			route('/ssr', '/src/Ssr.tsrx', { render: 'ssr' }),
			route('/spa', '/src/Spa.tsrx', { render: 'spa' }),
			route('/ssg', '/src/Ssg.tsrx', { render: 'ssg' }),
		],
	});
	const server = serve({
		...createSrvxServer({
			app,
			clientDirectory,
			loadRouteData: () => Response.json({ loaded: true }),
			renderSsrDocument: (template) => template.replace('SPA shell', 'SSR page'),
		}),
		manual: true,
		silent: true,
	});

	try {
		const rootResponse = await server.fetch(new Request('http://flamefront.test/'));
		assert.equal(rootResponse.status, 302);
		assert.equal(rootResponse.headers.get('location'), '/spa');

		const spaResponse = await server.fetch(new Request('http://flamefront.test/spa'));
		assert.equal(await spaResponse.text(), '<main>SPA shell</main>');

		const ssrResponse = await server.fetch(new Request('http://flamefront.test/ssr'));
		assert.equal(await ssrResponse.text(), '<main>SSR page</main>');

		const ssgResponse = await server.fetch(new Request('http://flamefront.test/ssg'));
		assert.equal(await ssgResponse.text(), '<main>Static page</main>');

		const dataResponse = await server.fetch(
			new Request('http://flamefront.test/__flamefront/data'),
		);
		assert.deepEqual(await dataResponse.json(), { loaded: true });
	} finally {
		await server.close();
		await rm(root, { recursive: true, force: true });
	}
});
