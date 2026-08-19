import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app } from '../src/routes.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = resolve(root, 'dist/client');
const port = Number(process.env.PORT ?? 4173);
const serverEntry = await import(`${pathToFileURL(resolve(root, 'dist/server/entry-server.js')).href}?preview=${Date.now()}`);
const ssrRoute = app.routes.find((route) => route.render === 'ssr');
const ssgRoute = app.routes.find((route) => route.render === 'ssg');
const spaRoutes = app.routes.filter((route) => route.render === 'spa');
const defaultSpaRoute = spaRoutes[0];

if (!ssrRoute || !ssgRoute || !defaultSpaRoute) {
	throw new Error('The route manifest must define SSR, SSG, and SPA routes.');
}

const contentTypes = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
};

function send(response, status, body, contentType = 'text/plain; charset=utf-8') {
	response.statusCode = status;
	response.setHeader('Content-Type', contentType);
	response.end(response.req.method === 'HEAD' ? undefined : body);
}

async function sendFile(response, filePath) {
	const body = await readFile(filePath);
	send(response, 200, body, contentTypes[extname(filePath)] ?? 'application/octet-stream');
}

function toFetchRequest(request, url) {
	return new Request(url, {
		method: request.method,
		headers: request.headers,
	});
}

async function sendFetchResponse(response, fetchResponse) {
	response.statusCode = fetchResponse.status;
	for (const [name, value] of fetchResponse.headers) response.setHeader(name, value);
	response.end(Buffer.from(await fetchResponse.arrayBuffer()));
}

function withinClientDir(filePath) {
	const clientPrefix = `${clientDir}${sep}`;
	return filePath === clientDir || filePath.startsWith(clientPrefix);
}

const server = createServer(async (request, response) => {
	const url = new URL(request.url ?? '/', 'http://localhost');
	const routeMatch = app.match(url);

	try {
		if (url.pathname === '/__flamefront/data') {
			await sendFetchResponse(response, await serverEntry.loadRouteData(toFetchRequest(request, url)));
			return;
		}

		if (url.pathname === '/') {
			response.statusCode = 302;
			response.setHeader('Location', defaultSpaRoute.path);
			response.end();
			return;
		}

		if (routeMatch?.data.render === 'ssr') {
			const template = await readFile(resolve(clientDir, 'index.html'), 'utf8');
			send(
				response,
				200,
				await serverEntry.renderSsrDocument(template, toFetchRequest(request, url)),
				'text/html; charset=utf-8',
			);
			return;
		}

		if (routeMatch?.data.render === 'ssg') {
			const ssgPath = routeMatch.data.path.replace(/^\/+|\/+$/g, '') || 'index';
			await sendFile(response, resolve(clientDir, ssgPath, 'index.html'));
			return;
		}

		if (routeMatch?.data.render === 'spa') {
			await sendFile(response, resolve(clientDir, 'index.html'));
			return;
		}

		const decodedPath = decodeURIComponent(url.pathname);
		const assetPath = resolve(clientDir, `.${decodedPath}`);
		if (withinClientDir(assetPath)) {
			try {
				await sendFile(response, assetPath);
			} catch (error) {
				if (error?.code === 'ENOENT') {
					send(response, 404, 'Not found');
					return;
				}
				throw error;
			}
			return;
		}

		send(response, 404, 'Not found');
	} catch (error) {
		console.error(error);
		send(response, 500, String(error.stack ?? error));
	}
});

server.listen(port, () => {
	console.log(`Octane route-mode preview server: http://localhost:${port}`);
});
