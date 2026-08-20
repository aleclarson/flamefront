import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRouteData, loadStaticRouteData } from '../src/remix-route-data.ts';

test('loads browser route data using the request URL and abort signal', async (context) => {
	const originalFetch = globalThis.fetch;
	context.after(() => {
		globalThis.fetch = originalFetch;
	});
	const controller = new AbortController();
	const request = new Request('https://example.test/items/one?view=full', {
		signal: controller.signal,
	});
	globalThis.fetch = async (input, init) => {
		const endpoint = new URL(String(input));
		assert.equal(endpoint.pathname, '/__flamefront/data');
		assert.equal(endpoint.searchParams.get('url'), 'https://example.test/items/one?view=full');
		assert.equal(init?.signal, request.signal);
		return Response.json({ message: 'loaded' });
	};

	assert.deepEqual(await loadRouteData({ request }), { message: 'loaded' });
});

test('reports unsuccessful browser route-data responses', async (context) => {
	const originalFetch = globalThis.fetch;
	context.after(() => {
		globalThis.fetch = originalFetch;
	});
	globalThis.fetch = async () => new Response('Unavailable', { status: 503 });

	await assert.rejects(
		loadRouteData({ request: new Request('https://example.test/items/one') }),
		/flamefront loader request failed with 503/,
	);
});

test('loads static route data from the generated artifact beside the document', async (context) => {
	const originalFetch = globalThis.fetch;
	context.after(() => {
		globalThis.fetch = originalFetch;
	});
	const request = new Request('https://example.test/about?view=full');
	globalThis.fetch = async (input, init) => {
		assert.equal(String(input), 'https://example.test/about/index.data.json');
		assert.equal(init?.signal, request.signal);
		return Response.json({ message: 'built' });
	};

	assert.deepEqual(await loadStaticRouteData({ request }), { message: 'built' });
});

test('reports unsuccessful static route-data responses', async (context) => {
	const originalFetch = globalThis.fetch;
	context.after(() => {
		globalThis.fetch = originalFetch;
	});
	globalThis.fetch = async () => new Response('Unavailable', { status: 404 });

	await assert.rejects(
		loadStaticRouteData({ request: new Request('https://example.test/about') }),
		/flamefront static route data request failed with 404/,
	);
});

test('propagates browser route-data aborts', async (context) => {
	const originalFetch = globalThis.fetch;
	context.after(() => {
		globalThis.fetch = originalFetch;
	});
	globalThis.fetch = async (_input, init) => {
		return new Promise((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
				once: true,
			});
		});
	};
	const controller = new AbortController();
	const pending = loadRouteData({
		request: new Request('https://example.test/items/one', { signal: controller.signal }),
	});
	controller.abort(new DOMException('Navigation aborted', 'AbortError'));

	await assert.rejects(pending, { name: 'AbortError' });
});
