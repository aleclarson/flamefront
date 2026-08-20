import assert from 'node:assert/strict';
import test from 'node:test';
import { defineApp, layout, route } from '../src/index.ts';

const shell = '/src/AppShell.tsrx';

test('defines explicit routes', () => {
	const app = defineApp({
		shell,
		routes: [
			route('/server', '/src/ServerPage.tsrx', { render: 'server' }),
			route('/client', '/src/App.tsrx', { render: 'client' }),
		],
	});

	assert.deepEqual(
		app.routes
			.filter((routeDefinition) => routeDefinition.render === 'client')
			.map((routeDefinition) => routeDefinition.path),
		['/client'],
	);
	assert.equal(app.shell, shell);
	assert.equal(Object.isFrozen(app.routes), true);
});

test('requires a shell entry outside the authored route tree', () => {
	const app = defineApp({ shell, routes: [] });
	assert.equal(app.shell, shell);
	assert.deepEqual(app.routeTree, []);

	assert.throws(
		() => Reflect.apply(defineApp, undefined, [{ routes: [] }]),
		/app shell entry must be a non-empty string/,
	);
	assert.throws(
		() => defineApp({ shell: '', routes: [] }),
		/app shell entry must be a non-empty string/,
	);
});

test('uses server as the default mode and rejects legacy mode names', () => {
	assert.equal(route('/default', '/src/Default.tsrx').render, 'server');
	assert.throws(
		() => Reflect.apply(route, undefined, ['/legacy', '/src/Legacy.tsrx', { render: 'ssr' }]),
		/render must be 'client', 'server', or 'static'/,
	);
});

test('rejects duplicate paths', () => {
	assert.throws(
		() =>
			defineApp({
				shell,
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
		shell,
		routes: [
			layout('/src/Shell.tsrx', [
				route('/client', '/src/Client.tsrx', { render: 'client' }),
				layout('/src/NestedShell.tsrx', [
					route('/account', '/src/Account.tsrx', { render: 'server' }),
				]),
			]),
			route('/standalone', '/src/Standalone.tsrx', { render: 'static' }),
		],
	});

	assert.deepEqual(
		app.routes.map(({ path, render }) => ({ path, render })),
		[
			{ path: '/client', render: 'client' },
			{ path: '/account', render: 'server' },
			{ path: '/standalone', render: 'static' },
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
				shell,
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
				shell,
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
		shell,
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
		shell,
		routes: [
			route('/articles/:slug', '/src/Article.tsrx', { render: 'server' }),
			route('/articles/new', '/src/NewArticle.tsrx', { render: 'client' }),
		],
	});

	assert.equal(app.match('/articles/new')?.data.render, 'client');
	assert.equal(app.match('/articles/new', { render: 'server' })?.data.entry, '/src/Article.tsrx');
	assert.equal(app.match('/articles/new', { render: 'static' }), null);
});

test('accepts every server and static hydration policy', () => {
	const app = defineApp({
		shell,
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
			route('/static-full', '/src/StaticFull.tsrx', {
				render: 'static',
				hydration: 'full',
			}),
			route('/static-deferred', '/src/StaticDeferred.tsrx', {
				render: 'static',
				hydration: 'deferred',
			}),
			route('/static-visible', '/src/StaticVisible.tsrx', {
				render: 'static',
				hydration: { when: 'visible', rootMargin: '200px' },
			}),
		],
	});

	assert.equal(app.routes.length, 10);
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
		() => route('/client', '/src/Client.tsrx', { render: 'client', hydration: 'none' }),
		/client hydration can only be 'full'/,
	);
	assert.throws(
		() =>
			route('/client-idle', '/src/Client.tsrx', {
				render: 'client',
				hydration: { when: 'idle' },
			}),
		/generated hydration requires render: 'server' or 'static'/,
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
		() => defineApp({ shell, routes: [route('/articles/:', '/src/Article.tsrx')] }),
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
		const app = defineApp({ shell, routes: [route('/data', '/src/Data.tsrx')] });
		await app.prefetch('https://example.test/data');
		assert.deepEqual(await app.load('https://example.test/data'), { value: 1 });
		assert.deepEqual(await app.load('https://example.test/data', { reload: true }), { value: 2 });
		assert.equal(requests, 2);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
