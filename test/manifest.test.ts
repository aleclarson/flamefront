import assert from 'node:assert/strict';
import test from 'node:test';
import { defineApp, layout, route } from '../src/index.ts';

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

test('normalizes pathless layouts into leaf routes', () => {
	const app = defineApp({
		routes: [
			layout('/src/Shell.tsrx', [
				route('/spa', '/src/Spa.tsrx', { render: 'spa' }),
				layout('/src/NestedShell.tsrx', [
					route('/account', '/src/Account.tsrx', { render: 'ssr' }),
				]),
			]),
			route('/standalone', '/src/Standalone.tsrx', { render: 'ssg' }),
		],
	});

	assert.deepEqual(
		app.routes.map(({ path, render }) => ({ path, render })),
		[
			{ path: '/spa', render: 'spa' },
			{ path: '/account', render: 'ssr' },
			{ path: '/standalone', render: 'ssg' },
		],
	);
	assert.equal(app.match('/account')?.data.entry, '/src/Account.tsrx');
	assert.equal('kind' in app.routeTree[0]! && app.routeTree[0].kind, 'layout');
	assert.equal(Object.isFrozen(app.routeTree), true);
	assert.equal(Object.isFrozen(app.routeTree[0]), true);
});

test('rejects duplicate paths across layout boundaries', () => {
	assert.throws(
		() =>
			defineApp({
				routes: [
					layout('/src/Shell.tsrx', [route('/same', '/src/Nested.tsrx')]),
					route('/same', '/src/Standalone.tsrx'),
				],
			}),
		/route path is duplicated/,
	);
});

test('validates authored layout definitions', () => {
	assert.throws(
		() =>
			defineApp({
				routes: [
					{
						kind: 'layout',
						entry: '',
						children: [route('/child', '/src/Child.tsrx')],
					},
				],
			}),
		/layout 1 entry must be a non-empty string/,
	);
});

test('matches the most specific route and extracts parameters', () => {
	const app = defineApp({
		routes: [
			route('/articles/:slug', '/src/Article.tsrx'),
			route('/articles/new', '/src/NewArticle.tsrx'),
		],
	});

	assert.equal(app.match('/articles/new')?.data.entry, '/src/NewArticle.tsrx');
	assert.deepEqual(app.match('/articles/hello%20world')?.params, {
		slug: 'hello world',
	});
	assert.equal(app.match('/articles/new/')?.data.entry, '/src/NewArticle.tsrx');
	assert.equal(app.match('/elsewhere'), null);
});

test('selects matches by render mode', () => {
	const app = defineApp({
		routes: [
			route('/articles/:slug', '/src/Article.tsrx', { render: 'ssr' }),
			route('/articles/new', '/src/NewArticle.tsrx', { render: 'spa' }),
		],
	});

	assert.equal(app.match('/articles/new')?.data.render, 'spa');
	assert.equal(app.match('/articles/new', { render: 'ssr' })?.data.entry, '/src/Article.tsrx');
	assert.equal(app.match('/articles/new', { render: 'ssg' }), null);
});

test('accepts every SSR hydration policy', () => {
	const app = defineApp({
		routes: [
			route('/full', '/src/Full.tsrx', { hydration: 'full' }),
			route('/owned', '/src/Owned.tsrx', { hydration: 'deferred' }),
			route('/static', '/src/Static.tsrx', { hydration: 'none' }),
			route('/idle', '/src/Idle.tsrx', {
				hydration: { when: 'idle', timeout: 500 },
			}),
			route('/visible', '/src/Visible.tsrx', {
				hydration: { when: 'visible', rootMargin: '200px', threshold: [0, 0.5] },
			}),
			route('/interaction', '/src/Interaction.tsrx', {
				hydration: { when: 'interaction', events: ['click', 'focusin'] },
			}),
			route('/media', '/src/Media.tsrx', {
				hydration: { when: 'media', query: '(min-width: 60rem)' },
			}),
		],
	});

	assert.equal(app.routes.length, 7);
	assert.deepEqual(app.match('/visible')?.data.hydration, {
		when: 'visible',
		rootMargin: '200px',
		threshold: [0, 0.5],
	});
	const visibleHydration = app.match('/visible')?.data.hydration;
	assert.equal(Object.isFrozen(visibleHydration), true);
	assert.equal(
		typeof visibleHydration === 'object' &&
			visibleHydration.when === 'visible' &&
			Object.isFrozen(visibleHydration.threshold),
		true,
	);
});

test('rejects hydration policies that cannot affect a render mode', () => {
	assert.throws(
		() => route('/spa', '/src/Spa.tsrx', { render: 'spa', hydration: 'none' }),
		/SPA hydration can only be 'full'/,
	);
	assert.throws(
		() => route('/ssg', '/src/Ssg.tsrx', { render: 'ssg', hydration: 'deferred' }),
		/SSG hydration can only be 'none'/,
	);
	assert.throws(
		() =>
			route('/spa-idle', '/src/Spa.tsrx', {
				render: 'spa',
				hydration: { when: 'idle' },
			}),
		/generated hydration requires render: 'ssr'/,
	);
});

test('validates generated hydration options', () => {
	assert.throws(
		() =>
			route('/visible', '/src/Visible.tsrx', {
				hydration: { when: 'visible', threshold: 2 },
			}),
		/threshold must contain numbers from 0 through 1/,
	);
	assert.throws(
		() =>
			route('/interaction', '/src/Interaction.tsrx', {
				hydration: { when: 'interaction', events: 'submit' as 'click' },
			}),
		/supported Octane interaction events/,
	);
	assert.throws(
		() =>
			route('/media', '/src/Media.tsrx', {
				hydration: { when: 'media', query: '' },
			}),
		/hydration query must be a non-empty string/,
	);
});

test('rejects invalid route patterns while defining the app', () => {
	assert.throws(
		() => defineApp({ routes: [route('/articles/:', '/src/Article.tsrx')] }),
		/parse|parameter|name/i,
	);
});

test('deduplicates load and prefetch requests', async () => {
	const originalFetch = globalThis.fetch;
	let requests = 0;
	globalThis.fetch = async () => {
		requests += 1;
		return Response.json({ value: requests });
	};

	try {
		const app = defineApp({ routes: [route('/data', '/src/Data.tsrx')] });
		await app.prefetch('https://example.test/data');
		assert.deepEqual(await app.load('https://example.test/data'), { value: 1 });
		assert.deepEqual(await app.load('https://example.test/data', { reload: true }), { value: 2 });
		assert.equal(requests, 2);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
