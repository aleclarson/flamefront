import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 5173);

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

const server = createHttpServer(async (request, response) => {
	const url = new URL(request.url ?? '/', 'http://localhost');

	try {
		if (url.pathname === '/ssr') {
			const template = await readFile(resolve(root, 'index.html'), 'utf8');
			const transformedTemplate = await vite.transformIndexHtml(url.pathname, template);
			const entry = await vite.ssrLoadModule('/src/entry-server.ts');
			sendHtml(response, 200, entry.renderSsrDocument(transformedTemplate));
			return;
		}

		if (url.pathname === '/ssg' || url.pathname === '/ssg/') {
			const entry = await vite.ssrLoadModule('/src/entry-server.ts');
			sendHtml(response, 200, await entry.renderSsgDocument());
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
