import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { app } from '../src/routes.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 5173);
const ssrRoute = app.routes.find((route) => route.render === 'ssr');
const ssgRoute = app.routes.find((route) => route.render === 'ssg');

if (!ssrRoute || !ssgRoute) throw new Error('The route manifest must define SSR and SSG routes.');

const vite = await createViteServer({
	root,
	appType: 'spa',
	server: { middlewareMode: true },
});

function sendHtml(response, status, html) {
	response.statusCode = status;
	response.setHeader('Content-Type', 'text/html; charset=utf-8');
	response.end(html);
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

const server = createHttpServer(async (request, response) => {
	const url = new URL(request.url ?? '/', 'http://localhost');
	const routeMatch = app.match(url);

	try {
		if (url.pathname === '/__flamefront/data') {
			const entry = await vite.ssrLoadModule('/src/entry-server.ts');
			await sendFetchResponse(response, await entry.loadRouteData(toFetchRequest(request, url)));
			return;
		}

		if (routeMatch?.data.render === 'ssr') {
			const template = await readFile(resolve(root, 'index.html'), 'utf8');
			const transformedTemplate = await vite.transformIndexHtml(url.pathname, template);
			const entry = await vite.ssrLoadModule('/src/entry-server.ts');
			sendHtml(
				response,
				200,
				await entry.renderSsrDocument(transformedTemplate, toFetchRequest(request, url)),
			);
			return;
		}

		if (routeMatch?.data.render === 'ssg') {
			const entry = await vite.ssrLoadModule('/src/entry-server.ts');
			sendHtml(response, 200, await entry.renderSsgDocument(toFetchRequest(request, url)));
			return;
		}
	} catch (error) {
		vite.ssrFixStacktrace(error);
		console.error(error);
		sendHtml(response, 500, `<pre>${String(error.stack ?? error)}</pre>`);
		return;
	}

	vite.middlewares(request, response, (error) => {
		if (error) {
			vite.ssrFixStacktrace(error);
			console.error(error);
			if (!response.headersSent) sendHtml(response, 500, `<pre>${String(error.stack ?? error)}</pre>`);
			return;
		}

		if (!response.headersSent) sendHtml(response, 404, 'Not found');
	});
});

server.listen(port, () => {
	console.log(`Octane route-mode dev server: http://localhost:${port}`);
});

async function close() {
	server.close();
	await vite.close();
}

process.once('SIGINT', close);
process.once('SIGTERM', close);
