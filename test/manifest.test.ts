import assert from 'node:assert/strict';
import test from 'node:test';
import { defineApp, route } from '../src/index.ts';

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
