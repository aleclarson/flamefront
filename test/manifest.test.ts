import assert from 'node:assert/strict';
import test from 'node:test';
import { defineApp, matchRoute, route } from '../src/index.ts';

test('defines explicit routes', () => {
	const app = defineApp({
		routes: [
			route('/ssr', '/src/SsrPage.tsrx', { render: 'ssr' }),
			route('/spa', '/src/App.tsrx', { render: 'spa' }),
		],
	});

	assert.deepEqual(
		app.routes
			.filter((routeDefinition) => routeDefinition.render === 'spa')
			.map((routeDefinition) => routeDefinition.path),
		['/spa'],
	);
	assert.equal(Object.isFrozen(app.routes), true);
});

test('rejects duplicate paths', () => {
	assert.throws(
		() =>
			defineApp({
				routes: [
					route('/same', '/src/One.tsrx'),
					route('/same', '/src/Two.tsrx'),
				],
			}),
		/route path is duplicated/,
	);
});

test('matches the most specific route and extracts parameters', () => {
	const app = defineApp({
		routes: [
			route('/articles/:slug', '/src/Article.tsrx'),
			route('/articles/new', '/src/NewArticle.tsrx'),
		],
	});

	assert.equal(matchRoute(app.routes, '/articles/new')?.data.entry, '/src/NewArticle.tsrx');
	assert.deepEqual(matchRoute(app.routes, '/articles/hello%20world')?.params, {
		slug: 'hello world',
	});
	assert.equal(matchRoute(app.routes, '/articles/new/')?.data.entry, '/src/NewArticle.tsrx');
	assert.equal(matchRoute(app.routes, '/elsewhere'), null);
});

test('rejects invalid route patterns while defining the app', () => {
	assert.throws(
		() => defineApp({ routes: [route('/articles/:', '/src/Article.tsrx')] }),
		/parse|parameter|name/i,
	);
});
