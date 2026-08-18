import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = resolve(root, 'dist/client');
const port = Number(process.env.PORT ?? 4173);
const serverEntry = await import(`${pathToFileURL(resolve(root, 'dist/server/entry-server.js')).href}?preview=${Date.now()}`);

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

function withinClientDir(filePath) {
	const clientPrefix = `${clientDir}${sep}`;
	return filePath === clientDir || filePath.startsWith(clientPrefix);
}

const server = createServer(async (request, response) => {
	const url = new URL(request.url ?? '/', 'http://localhost');

	try {
		if (url.pathname === '/') {
			response.statusCode = 302;
			response.setHeader('Location', '/spa-one');
			response.end();
			return;
		}

		if (url.pathname === '/ssr') {
			const template = await readFile(resolve(clientDir, 'index.html'), 'utf8');
			send(response, 200, serverEntry.renderSsrDocument(template), 'text/html; charset=utf-8');
			return;
		}

		if (url.pathname === '/ssg' || url.pathname === '/ssg/') {
			await sendFile(response, resolve(clientDir, 'ssg/index.html'));
			return;
		}

		if (url.pathname === '/spa-one' || url.pathname === '/spa-two') {
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
