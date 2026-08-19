import assert from 'node:assert/strict';
import test from 'node:test';
import { defineApp, route } from '../src/index.ts';
import { loadRoute } from '../src/server.ts';

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
