import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from '../src/routes.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 40_000 + (process.pid % 10_000);
const base = `http://127.0.0.1:${port}`;
const previewToken = `route-check-${process.pid}-${Date.now()}`;
const serverRoutes = app.routes.filter((route) => route.render === 'server');
const staticRoute = app.routes.find((route) => route.render === 'static');
const clientRoutes = app.routes.filter((route) => route.render === 'client');
const productMatch = app.match('/products/octane');
const appLayout = app.routeTree.find((config) => 'children' in config);
const layoutPaths = appLayout?.children.map((route) => route.path) ?? [];
const standalonePaths = app.routeTree
	.filter((config) => !('children' in config))
	.map((route) => route.path);

assert.equal(app.shell, '/src/AppShell.tsrx');
assert.equal(serverRoutes.length, 4, 'The field guide must define four server routes.');
assert.equal(clientRoutes.length, 2, 'The field guide must define two client routes.');
assert.equal(staticRoute?.path, '/about', 'The field guide must define one /about static route.');
assert.deepEqual(standalonePaths, ['/', '/about']);
assert.equal(appLayout?.entry, '/src/AppLayout.tsrx');
assert.deepEqual(layoutPaths, [
	'/products/:productId',
	'/hydration',
	'/server-static',
	'/workspace',
	'/workspace/settings',
]);
assert.equal(productMatch?.data.path, '/products/:productId');
assert.equal(productMatch?.data.render, 'server');
assert.equal(productMatch?.params.productId, 'octane');
assert.equal(app.match('/about')?.data.render, 'static');
assert.equal(app.match('/workspace')?.data.render, 'client');
assert.equal(app.match('/missing'), null);
assert.equal(
	app.routes.some((route) => 'label' in route || 'navLabel' in route),
	false,
	'Compiled route metadata must not contain display labels.',
);

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

async function fetchHtml(pathname) {
	const response = await fetch(`${base}${pathname}`);
	assert.equal(response.status, 200, `${pathname} returned ${response.status}.`);
	return { response, html: await response.text() };
}

async function loaderData(pathname) {
	const endpoint = new URL('/__flamefront/data', base);
	endpoint.searchParams.set('url', `${base}${pathname}`);
	const response = await fetch(endpoint);
	assert.equal(response.status, 200, `${pathname} loader returned ${response.status}.`);
	return response.json();
}

function assertShell(html, label) {
	assert.match(html, /data-testid="shell-state"/, `${label} is missing shell state.`);
	assert.match(html, /data-testid="shell-counter"/, `${label} is missing shell counter.`);
	assert.match(html, /data-testid="shell-transition"/, `${label} is missing shell transition state.`);
}

function assertAppLayout(html, label) {
	assert.match(html, /data-testid="layout-state"/, `${label} is missing app layout state.`);
	assert.match(html, /aria-label="All routes"/, `${label} is missing app navigation.`);
	assert.match(html, /data-route-link="\/about"/, `${label} is missing the static router link.`);
	assert.match(html, /data-discover="true"/, `${label} is missing a client router link marker.`);
}

try {
	await waitForPreview();
	const assetDirectory = await fetch(`${base}/assets`);
	assert.equal(assetDirectory.status, 404, 'An asset directory request did not return 404.');

	const home = (await fetchHtml('/')).html;
	assertShell(home, 'The server landing document');
	assert.doesNotMatch(home, /data-testid="layout-state"/);
	assert.doesNotMatch(home, /aria-label="All routes"/);
	assert.match(home, /One graph, several ways to render/);
	assert.match(home, /Rendered \/ on the request server\./);
	assert.match(home, /data-render-mode="server"/);
	assert.match(home, /window\.__staticRouterHydrationData/);

	const product = (await fetchHtml('/products/octane')).html;
	assertShell(product, 'The product document');
	assertAppLayout(product, 'The product document');
	assert.match(product, /Octane field notes/);
	assert.match(product, /Server loader matched productId="octane"\./);
	assert.match(product, /catalog-loaded-from-server-only-module/);
	assert.match(product, /data-render-mode="server"/);
	assert.match(product, /interaction/);

	const alternateProduct = await loaderData('/products/flamefront');
	assert.equal(alternateProduct.product.id, 'flamefront');

	const hydration = (await fetchHtml('/hydration')).html;
	assertShell(hydration, 'The hydration document');
	assertAppLayout(hydration, 'The hydration document');
	assert.match(hydration, /Four boundaries, one server response/);
	assert.match(hydration, /data-render-mode="server"/);
	for (const strategy of ['idle', 'visible', 'interaction', 'media']) {
		assert.match(hydration, new RegExp(`data-probe="${strategy}"`));
	}
	assert.equal(
		hydration.match(/Server HTML is dormant\./g)?.length,
		4,
		'The hydration lab did not render four dormant server probes.',
	);

	const serverStatic = (await fetchHtml('/server-static')).html;
	assertShell(serverStatic, 'The server-static document');
	assertAppLayout(serverStatic, 'The server-static document');
	assert.match(serverStatic, /An inert page in an interactive shell/);
	assert.match(serverStatic, /data-render-mode="server"/);
	assert.match(serverStatic, /data-testid="server-static-proof"/);

	for (const route of clientRoutes) {
		const data = await loaderData(route.path);
		assert.equal(
			data.message,
			`Browser fetched loader data for ${route.path}.`,
			`${route.path} loader endpoint returned unexpected data.`,
		);
		const clientDocument = (await fetchHtml(route.path)).html;
		assertShell(clientDocument, `${route.path} client shell`);
		assert.doesNotMatch(clientDocument, /data-testid="layout-state"/);
		assert.doesNotMatch(clientDocument, /aria-label="All routes"/);
		assert.match(clientDocument, /\/assets\//);
		assert.doesNotMatch(clientDocument, /<main/);
	}

	const staticResponse = await fetch(`${base}${staticRoute.path}`);
	assert.equal(staticResponse.status, 200);
	assert.ok(staticResponse.headers.has('etag'), 'srvx/static did not emit an ETag for /about.');
	const staticHtml = await staticResponse.text();
	assertShell(staticHtml, 'The static document');
	assert.doesNotMatch(staticHtml, /data-testid="layout-state"/);
	assert.doesNotMatch(staticHtml, /aria-label="All routes"/);
	assert.match(staticHtml, /Built once, served as a document/);
	assert.match(staticHtml, /data-render-mode="static"/);
	assert.match(staticHtml, /Generated \/about during ff build\./);
	assert.match(staticHtml, /data-testid="about-static-proof"/);
	assert.match(staticHtml, /type="module"/);

	const builtShell = await readFile(resolve(root, 'dist/client/index.html'), 'utf8');
	assertShell(builtShell, 'The built client shell');
	assert.doesNotMatch(builtShell, /data-testid="layout-state"/);
	assert.doesNotMatch(builtShell, /aria-label="All routes"/);
	assert.doesNotMatch(builtShell, /<main/);

	const staticPath = staticRoute.path.replace(/^\/+|\/+$/g, '') || 'index';
	const generatedStatic = await readFile(
		resolve(root, 'dist/client', staticPath, 'index.html'),
		'utf8',
	);
	assert.match(generatedStatic, /data-render-mode="static"/);
	assert.match(generatedStatic, /data-testid="shell-state"/);
	assert.match(generatedStatic, /type="module"/);

	const staticDataFile = resolve(root, 'dist/client', staticPath, 'index.data.json');
	const staticData = JSON.parse(await readFile(staticDataFile, 'utf8'));
	assert.equal(staticData.message, 'Generated /about during ff build.');
	const servedStaticData = await fetch(`${base}/about/index.data.json`);
	assert.equal(servedStaticData.status, 200);
	assert.deepEqual(await servedStaticData.json(), staticData);

	const clientManifest = JSON.parse(
		await readFile(resolve(root, 'dist/client/.vite/manifest.json'), 'utf8'),
	);
	assert.ok(clientManifest['index.html']?.file, 'Client build manifest is missing index.html.');
	const clientAssets = await readdir(resolve(root, 'dist/client/assets'));
	const clientJavaScript = await Promise.all(
		clientAssets
			.filter((asset) => asset.endsWith('.js'))
			.map((asset) => readFile(resolve(root, 'dist/client/assets', asset), 'utf8')),
	);
	assert.ok(
		clientJavaScript.some((source) => source.includes('index.data.json')),
		'Client build is missing the generated static route-data loader.',
	);
	assert(
		!clientJavaScript.some((source) => source.includes('catalog-loaded-from-server-only-module')),
		'The server-only catalog module leaked into a client chunk.',
	);
	const clientSourceMaps = await Promise.all(
		clientAssets
			.filter((asset) => asset.endsWith('.js.map'))
			.map((asset) => readFile(resolve(root, 'dist/client/assets', asset), 'utf8')),
	);
	assert.equal(
		clientSourceMaps.some((source) => source.includes('catalog-loaded-from-server-only-module')),
		false,
		'The server-only catalog marker leaked into a client source map.',
	);
	assert.ok(clientSourceMaps.length >= 10, 'Client build is missing production JavaScript source maps.');
	await readFile(resolve(root, 'dist/client', `${clientManifest['index.html'].file}.map`));
	await readFile(resolve(root, 'dist/server/server.js.map'));

	console.log('Route matching and the shell/layout route tree are observable in production output.');
	console.log('Server documents cover full, generated, author-owned, and permanent hydration modes.');
	console.log('Client routes receive shell HTML, loader data, and no server-rendered leaf.');
	console.log('Static output includes the browser router and a fetchable route-data artifact.');
	console.log('Server-only catalog code is absent from client chunks and source maps.');
} finally {
	preview.kill('SIGTERM');
}
