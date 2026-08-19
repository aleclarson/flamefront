import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from '../src/routes.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 40_000 + (process.pid % 10_000);
const base = `http://127.0.0.1:${port}`;
const previewToken = `route-check-${process.pid}-${Date.now()}`;
const ssrRoute = app.routes.find((route) => route.render === 'ssr');
const ssgRoute = app.routes.find((route) => route.render === 'ssg');
const spaRoutes = app.routes.filter((route) => route.render === 'spa');

if (!ssrRoute || !ssgRoute || spaRoutes.length !== 2) {
	throw new Error('The route manifest must define one SSR, one SSG, and two SPA routes.');
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
			const response = await fetch(`${base}${ssrRoute.path}`);
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

try {
	await waitForPreview();
	const landing = await fetch(base, { redirect: 'manual' });
	assert(landing.status === 302, 'The preview root did not redirect to the default SPA route.');
	assert(
		landing.headers.get('location') === spaRoutes[0].path,
		'The preview root redirected to the wrong route.',
	);
	const assetDirectory = await fetch(`${base}/assets`);
	assert(assetDirectory.status === 404, 'An asset directory request did not return 404.');

	const ssr = await fetch(`${base}${ssrRoute.path}`).then((response) => response.text());
	assert(
		!ssr.includes('Unexpected Application Error!'),
		'SSR response contains Remix default error UI.',
	);
	assert(ssr.includes('SSR route with deferred hydration'), 'SSR label is missing from the initial response.');
	assert(ssr.includes('aria-label="All routes"'), 'SSR response is missing the shared shell navigation.');
	assert(ssr.includes('data-testid="deferred-panel"'), 'SSR response is missing the deferred boundary content.');
	assert(
		ssr.includes('window.__staticRouterHydrationData'),
		'SSR response is missing serialized Remix hydration state.',
	);
	assert(
		ssr.includes('Loader resolved /ssr before SSR.'),
		'SSR loader data is missing from the initial response.',
	);

	const ssgResponse = await fetch(`${base}${ssgRoute.path}`);
	assert(ssgResponse.headers.has('etag'), 'srvx/static did not emit an ETag for the SSG page.');
	const ssg = await ssgResponse.text();
	assert(ssg.includes('>SSG route</h1>'), 'SSG label is missing from the generated document.');
	assert(!ssg.includes('type="module"'), 'SSG output unexpectedly includes a client module.');
	assert(
		ssg.includes('Loader resolved /ssg during the build.'),
		'SSG loader data is missing from the generated document.',
	);

	for (const route of spaRoutes) {
		const endpoint = new URL('/__flamefront/data', base);
		endpoint.searchParams.set('url', `${base}${route.path}`);
		const loaderData = await fetch(endpoint).then((response) => response.json());
		assert(
			loaderData.message === `Loader prefetched ${route.path}.`,
			`${route.path} loader endpoint returned unexpected data.`,
		);
	}

	for (const route of spaRoutes) {
		const spa = await fetch(`${base}${route.path}`).then((response) => response.text());
		assert(spa.includes('/assets/'), `${route.path} did not receive the Vite SPA shell.`);
		assert(!spa.includes('SPA route one'), `${route.path} was server-rendered instead of client-only.`);
		assert(!spa.includes('SPA route two'), `${route.path} was server-rendered instead of client-only.`);
	}

	const ssgPath = ssgRoute.path.replace(/^\/+|\/+$/g, '') || 'index';
	const generatedSsg = await readFile(resolve(root, 'dist/client', ssgPath, 'index.html'), 'utf8');
	assert(generatedSsg.includes('data-render-mode="ssg"'), 'Build output is missing the SSG mode marker.');
	const clientManifest = JSON.parse(
		await readFile(resolve(root, 'dist/client/.vite/manifest.json'), 'utf8'),
	);
	assert(
		Object.values(clientManifest).some((asset) => asset.file.endsWith('.js')),
		'Client build manifest is missing JavaScript output.',
	);
	const clientAssets = await readdir(resolve(root, 'dist/client/assets'));
	assert(
		clientAssets.filter((asset) => asset.endsWith('.js.map')).length >= 5,
		'Client build is missing production JavaScript source maps.',
	);
	await readFile(resolve(root, 'dist/client', `${clientManifest['index.html'].file}.map`));
	await readFile(resolve(root, 'dist/server/server.js.map'));

	console.log('SSR response contains the shared shell, loader hydration state, label, and deferred HTML.');
	console.log('srvx/static serves SSG output with build-time loader data, an ETag, and no client module.');
	console.log('Both SPA paths expose loader data and return a client-only Vite shell.');
	console.log('Production client and srvx server JavaScript source maps are present.');
} finally {
	preview.kill('SIGTERM');
}
