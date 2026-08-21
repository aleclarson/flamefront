import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { serve } from 'srvx';
import { defineApp, route } from '../src/index.ts';
import { loadRoute } from '../src/server.ts';
import { createSrvxServerEntry } from '../src/srvx.ts';

const shell = '/src/AppShell.tsrx';

test('loads the matched route module with request parameters', async () => {
	const app = defineApp({
		shell,
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
	const app = defineApp({ shell, routes: [route('/known', '/src/Known.tsrx')] });
	const loaded = await loadRoute(app, new Request('https://example.test/unknown'), async () => {
		throw new Error('An unmatched route must not be imported.');
	});

	assert.equal(loaded, null);
});

test('creates a srvx handler for every render mode', async () => {
	const root = await mkdtemp(resolve(tmpdir(), 'flamefront-srvx-'));
	const clientDirectory = resolve(root, 'client');
	await mkdir(resolve(clientDirectory, 'static'), { recursive: true });
	await writeFile(resolve(clientDirectory, 'index.html'), '<main>Client shell</main>');
	await writeFile(resolve(clientDirectory, 'static/index.html'), '<main>Static page</main>');
	const app = defineApp({
		shell,
		routes: [
			route('/server', '/src/Server.tsrx', { render: 'server' }),
			route('/client', '/src/Client.tsrx', { render: 'client' }),
			route('/static', '/src/Static.tsrx', { render: 'static' }),
		],
	});
	const server = serve({
		...createSrvxServerEntry({
			app,
			documents: {
				loadRouteData: async () => Response.json({ loaded: true }),
				renderDocument: async (template, request, options) => ({
					html: template.replace(
						'Client shell',
						options?.mode === 'static'
							? 'Static page rendered'
							: new URL(request.url).pathname === '/client'
								? 'Client shell rendered'
								: 'SSR page',
					),
				}),
			},
			assets: { clientDirectory },
		}),
		manual: true,
		silent: true,
	});

	try {
		const rootResponse = await server.fetch(new Request('http://flamefront.test/'));
		assert.equal(rootResponse.status, 302);
		assert.equal(rootResponse.headers.get('location'), '/client');

		const clientResponse = await server.fetch(new Request('http://flamefront.test/client'));
		assert.equal(await clientResponse.text(), '<main>Client shell rendered</main>');

		const serverResponse = await server.fetch(new Request('http://flamefront.test/server'));
		assert.equal(await serverResponse.text(), '<main>SSR page</main>');

		const staticResponse = await server.fetch(new Request('http://flamefront.test/static'));
		assert.equal(await staticResponse.text(), '<main>Static page</main>');

		const dataResponse = await server.fetch(
			new Request('http://flamefront.test/__flamefront/data'),
		);
		assert.deepEqual(await dataResponse.json(), { loaded: true });
	} finally {
		await server.close();
		await rm(root, { recursive: true, force: true });
	}
});
