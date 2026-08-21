import assert from 'node:assert/strict';
import test from 'node:test';
import { defineApp, route } from '../src/index.ts';
import { createRouteRuntime } from '../src/server.ts';

const shell = '/src/AppShell.tsrx';

test('uses the explicit importer and one request context for route data', async () => {
	const app = defineApp({
		shell,
		routing: { basename: '/app', dataPath: '/__data' },
		routes: [route('/articles/:slug', '/src/Article.tsrx')],
	});
	const contexts: unknown[] = [];
	const runtime = createRouteRuntime({
		app,
		importRoute: async (entry) => ({
			default: entry,
			loader: ({ request, params, context }) => ({
				pathname: new URL(request.url).pathname,
				slug: params.slug,
				context,
			}),
		}),
		requestContext: async (input) => {
			const context = {
				url: input.request.url,
				purpose: input.purpose,
				...(input.mode === undefined ? {} : { mode: input.mode }),
				route: input.route?.path,
			};
			contexts.push(context);
			return context;
		},
	});

	const request = new Request('https://example.test/app/articles/hello');
	const loaded = await runtime.loadRoute(request);

	assert.deepEqual(loaded?.loaderData, {
		pathname: '/app/articles/hello',
		slug: 'hello',
		context: {
			url: request.url,
			purpose: 'data',
			route: '/articles/:slug',
		},
	});
	assert.equal(contexts.length, 1);
	assert.equal(app.match('/app/articles/hello')?.data.entry, '/src/Article.tsrx');
	assert.equal(app.match('/articles/hello'), null);

	const endpoint = new URL('https://example.test/__data');
	endpoint.searchParams.set('url', request.url);
	const response = await runtime.loadRouteData(new Request(endpoint));
	assert.deepEqual(await response.json(), {
		pathname: '/app/articles/hello',
		slug: 'hello',
		context: {
			url: request.url,
			purpose: 'data',
			route: '/articles/:slug',
		},
	});
	assert.equal(contexts.length, 2);
});

test('does not import an unmatched route', async () => {
	const app = defineApp({
		shell,
		routes: [route('/known', '/src/Known.tsrx')],
	});
	const runtime = createRouteRuntime({
		app,
		importRoute: async () => {
			throw new Error('unmatched routes must not be imported');
		},
	});

	assert.equal(await runtime.loadRoute(new Request('https://example.test/unknown')), null);
	assert.equal(
		(await runtime.loadRouteData(
			new Request('https://example.test/__flamefront/data?url=https%3A%2F%2Fexample.test%2Funknown'),
		)).status,
		404,
	);
});
