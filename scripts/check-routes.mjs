import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from '../src/routes.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 40_000 + (process.pid % 10_000);
const base = `http://127.0.0.1:${port}`;
const previewToken = `route-check-${process.pid}-${Date.now()}`;
const ssrRoutes = app.routes.filter((route) => route.render === 'ssr');
const ssgRoute = app.routes.find((route) => route.render === 'ssg');
const spaRoutes = app.routes.filter((route) => route.render === 'spa');
const productMatch = app.match('/products/octane');

if (ssrRoutes.length !== 4 || !ssgRoute || spaRoutes.length !== 2) {
	throw new Error('The field guide must define four SSR, one SSG, and two SPA routes.');
}
if (productMatch?.data.path !== '/products/:productId' || productMatch.params.productId !== 'octane') {
	throw new Error('The dynamic product route did not match and decode productId.');
}
if (app.routes.some((route) => 'label' in route || 'navLabel' in route)) {
	throw new Error('Compiled route metadata must not contain display labels.');
}

const preview = spawn(resolve(root, 'node_modules/.bin/ff'), ['preview'], {
	cwd: root,
	env: { ...process.env, PORT: String(port), FLAMEFRONT_CHECK_TOKEN: previewToken },
	stdio: ['ignore', 'pipe', 'pipe'],
});

let previewOutput = '';
preview.stdout.on('data', (chunk) => {
	previewOutput += chunk;
});
preview.stderr.on('data', (chunk) => {
	previewOutput += chunk;
});

async function waitForPreview() {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		try {
			const response = await fetch(base);
			if (
				response.status === 200 &&
				response.headers.get('x-flamefront-check-token') === previewToken
			) return;
		} catch {
			// The preview process is still starting.
		}
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
	}
	throw new Error(`Preview did not start.\n${previewOutput}`);
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

async function html(pathname) {
	const response = await fetch(`${base}${pathname}`);
	assert(response.status === 200, `${pathname} returned ${response.status}.`);
	return response.text();
}

async function loaderData(pathname) {
	const endpoint = new URL('/__flamefront/data', base);
	endpoint.searchParams.set('url', `${base}${pathname}`);
	const response = await fetch(endpoint);
	assert(response.status === 200, `${pathname} loader returned ${response.status}.`);
	return response.json();
}

try {
	await waitForPreview();
	const assetDirectory = await fetch(`${base}/assets`);
	assert(assetDirectory.status === 404, 'An asset directory request did not return 404.');

	const home = await html('/');
	assert(home.includes('One graph, several ways to render'), 'Full-hydration SSR heading is missing.');
	assert(home.includes('Rendered / on the request server.'), 'Home loader data is missing.');
	assert(home.includes('data-testid="shell-counter"'), 'The shared layout state is missing.');
	assert(home.includes('window.__staticRouterHydrationData'), 'SSR hydration data is missing.');
	assert(home.includes('aria-label="All routes"'), 'Shared navigation is missing.');

	const product = await html('/products/octane');
	assert(product.includes('Octane field notes'), 'Dynamic product data is missing from SSR.');
	assert(
		product.includes('Server loader matched productId="octane".'),
		'Dynamic route params did not reach the product loader.',
	);
	assert(
		product.includes('catalog-loaded-from-server-only-module'),
		'The server-only product source did not reach serialized loader data.',
	);
	assert(product.includes('interaction'), 'Generated hydration metadata is missing.');

	const alternateProduct = await loaderData('/products/flamefront');
	assert(
		alternateProduct.product.id === 'flamefront',
		'The parameterized loader did not resolve a second product.',
	);

	const hydration = await html('/hydration');
	assert(hydration.includes('Four boundaries, one SSR response'), 'Hydration lab heading is missing.');
	for (const strategy of ['idle', 'visible', 'interaction', 'media']) {
		assert(
			hydration.includes(`data-probe="${strategy}"`),
			`The ${strategy} hydration boundary is missing its SSR content.`,
		);
	}
	assert(
		hydration.match(/SSR HTML is dormant\./g)?.length === 4,
		'The hydration lab did not render four dormant SSR probes.',
	);

	const serverStatic = await html('/server-static');
	assert(serverStatic.includes('An inert page in an interactive shell'), 'Static SSR heading is missing.');
	assert(
		serverStatic.includes('data-testid="server-static-proof"'),
		'The permanent server-owned surface is missing.',
	);

	for (const route of spaRoutes) {
		const data = await loaderData(route.path);
		assert(
			data.message === `Browser fetched loader data for ${route.path}.`,
			`${route.path} loader endpoint returned unexpected data.`,
		);
		const spa = await html(route.path);
		assert(spa.includes('/assets/'), `${route.path} did not receive the Vite SPA shell.`);
		assert(!spa.includes('<main'), `${route.path} was server-rendered instead of client-only.`);
	}

	const ssgResponse = await fetch(`${base}${ssgRoute.path}`);
	assert(ssgResponse.headers.has('etag'), 'srvx/static did not emit an ETag for the SSG page.');
	const ssg = await ssgResponse.text();
	assert(ssg.includes('Built once, served as a document'), 'SSG heading is missing.');
	assert(!ssg.includes('type="module"'), 'SSG output unexpectedly includes a client module.');
	assert(ssg.includes('Generated /about during ff build.'), 'SSG build loader data is missing.');

	const ssgPath = ssgRoute.path.replace(/^\/+|\/+$/g, '') || 'index';
	const generatedSsg = await readFile(resolve(root, 'dist/client', ssgPath, 'index.html'), 'utf8');
	assert(generatedSsg.includes('data-render-mode="ssg"'), 'Build output is missing the SSG marker.');
	const clientManifest = JSON.parse(
		await readFile(resolve(root, 'dist/client/.vite/manifest.json'), 'utf8'),
	);
	assert(
		Object.values(clientManifest).some((asset) => asset.file.endsWith('.js')),
		'Client build manifest is missing JavaScript output.',
	);
	const clientAssets = await readdir(resolve(root, 'dist/client/assets'));
	const clientJavaScript = await Promise.all(
		clientAssets
			.filter((asset) => asset.endsWith('.js'))
			.map((asset) => readFile(resolve(root, 'dist/client/assets', asset), 'utf8')),
	);
	assert(
		!clientJavaScript.some((source) => source.includes('catalog-loaded-from-server-only-module')),
		'The server-only catalog module leaked into a client chunk.',
	);
	assert(
		clientAssets.filter((asset) => asset.endsWith('.js.map')).length >= 10,
		'Client build is missing production JavaScript source maps.',
	);
	await readFile(resolve(root, 'dist/client', `${clientManifest['index.html'].file}.map`));
	await readFile(resolve(root, 'dist/server/server.js.map'));

	console.log('Four SSR routes prove full, generated, author-owned, and permanent hydration modes.');
	console.log('Dynamic params and server-only catalog code work without leaking into client chunks.');
	console.log('Both SPA loaders return data while their paths receive only the client shell.');
	console.log('The SSG document has build data, an ETag, and no client module.');
	console.log('Production client and srvx server JavaScript source maps are present.');
} finally {
	preview.kill('SIGTERM');
}
