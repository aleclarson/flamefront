import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ServerOptions } from 'srvx';
import type { AppDefinition, RouteDefinition } from './index.ts';

interface AppModule {
	app?: AppDefinition;
	default?: AppDefinition;
}

interface ServerEntry {
	default?: ServerOptions;
	loadRouteData?(request: Request): Promise<Response>;
	renderSsgDocument?(request: Request): Promise<string>;
	renderSsrDocument?(template: string, request: Request): Promise<string>;
}

export interface ProjectContext {
	readonly app: AppDefinition;
	readonly root: string;
	readonly routesFile: string;
}

export async function loadProject(root = process.cwd()): Promise<ProjectContext> {
	const routesFile = resolve(root, 'src/routes.ts');
	try {
		await access(routesFile);
	} catch {
		throw new Error(`Could not find ${routesFile}. Run ff from an app with src/routes.ts.`);
	}

	const url = pathToFileURL(routesFile);
	url.searchParams.set('ff', String(Date.now()));
	const module = (await import(url.href)) as AppModule;
	const app = module.app ?? module.default;
	if (!app || !Array.isArray(app.routes)) {
		throw new Error(`${routesFile} must export an app with a routes array.`);
	}
	return { app, root, routesFile };
}

function requireServerExport<K extends keyof ServerEntry>(
	entry: ServerEntry,
	name: K,
): NonNullable<ServerEntry[K]> {
	const value = entry[name];
	if (typeof value !== 'function') {
		throw new Error(`src/entry-server.ts must export ${String(name)}().`);
	}
	return value as NonNullable<ServerEntry[K]>;
}

function toRequest(request: IncomingMessage, url: URL): Request {
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (Array.isArray(value)) {
			for (const item of value) headers.append(name, item);
		} else if (value !== undefined) {
			headers.set(name, value);
		}
	}
	return new Request(url, {
		method: request.method,
		headers,
	});
}

function send(
	response: ServerResponse,
	status: number,
	body: string | Uint8Array,
	contentType = 'text/plain; charset=utf-8',
): void {
	response.statusCode = status;
	response.setHeader('Content-Type', contentType);
	response.end(response.req.method === 'HEAD' ? undefined : body);
}

async function sendFetchResponse(response: ServerResponse, fetchResponse: Response): Promise<void> {
	response.statusCode = fetchResponse.status;
	for (const [name, value] of fetchResponse.headers) response.setHeader(name, value);
	response.end(
		response.req.method === 'HEAD'
			? undefined
			: Buffer.from(await fetchResponse.arrayBuffer()),
	);
}

function isWithin(directory: string, filePath: string): boolean {
	const pathFromDirectory = relative(directory, filePath);
	return pathFromDirectory === '' || (
		pathFromDirectory !== '..' &&
		!pathFromDirectory.startsWith(`..${sep}`) &&
		!pathFromDirectory.startsWith(sep)
	);
}

function staticRouteFile(clientDirectory: string, route: RouteDefinition): string {
	if (/[:*]/.test(route.path)) {
		throw new Error(
			`Cannot prerender parameterized SSG route ${JSON.stringify(route.path)} without concrete paths.`,
		);
	}

	const segments = route.path.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
	if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes('/'))) {
		throw new Error(`Cannot write unsafe SSG route path ${JSON.stringify(route.path)}.`);
	}
	const filePath = resolve(clientDirectory, ...segments, 'index.html');
	if (!isWithin(clientDirectory, filePath)) {
		throw new Error(`Cannot write SSG route outside the client build: ${JSON.stringify(route.path)}.`);
	}
	return filePath;
}

async function loadBuiltServer(root: string): Promise<ServerEntry> {
	const serverFile = resolve(root, 'dist/server/server.js');
	try {
		await access(serverFile);
	} catch {
		throw new Error(`Could not find ${serverFile}. Run ff build first.`);
	}
	return import(pathToFileURL(serverFile).href) as Promise<ServerEntry>;
}

function requestUrl(request: IncomingMessage): URL {
	return new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
}

async function listen(
	server: ReturnType<typeof createHttpServer>,
	port: number,
	label: string,
): Promise<void> {
	await new Promise<void>((resolvePromise, reject) => {
		server.once('error', reject);
		server.listen(port, () => {
			server.off('error', reject);
			console.log(`${label}: http://localhost:${port}`);
			resolvePromise();
		});
	});
}

export async function buildProject(root = process.cwd()): Promise<void> {
	const { app } = await loadProject(root);
	const { build } = await import('vite');
	const dist = resolve(root, 'dist');
	const clientDirectory = resolve(dist, 'client');

	await rm(dist, { recursive: true, force: true });
	await build({
		root,
		configFile: resolve(root, 'vite.config.ts'),
		build: {
			outDir: clientDirectory,
			manifest: true,
		},
	});
	await build({
		root,
		configFile: resolve(root, 'vite.config.ts'),
		ssr: { noExternal: ['srvx'] },
		build: {
			ssr: resolve(root, 'src/entry-server.ts'),
			outDir: resolve(dist, 'server'),
			rollupOptions: {
				output: { entryFileNames: 'server.js' },
			},
		},
	});

	const staticRoutes = app.routes.filter((route) => route.render === 'ssg');
	if (staticRoutes.length === 0) return;

	const serverEntry = await loadBuiltServer(root);
	const renderSsgDocument = requireServerExport(serverEntry, 'renderSsgDocument');
	await prerenderStaticRoutes(root, clientDirectory, staticRoutes, renderSsgDocument);
}

export async function prerenderStaticRoutes(
	root: string,
	clientDirectory: string,
	routes: readonly RouteDefinition[],
	render: (request: Request) => Promise<string>,
): Promise<void> {
	for (const route of routes) {
		const outputFile = staticRouteFile(clientDirectory, route);
		const html = await render(
			new Request(new URL(route.path, 'http://flamefront.build')),
		);
		await mkdir(dirname(outputFile), { recursive: true });
		await writeFile(outputFile, html);
		console.log(`Generated ${relative(root, outputFile)}.`);
	}
}

export async function devProject(root = process.cwd()): Promise<void> {
	const { app } = await loadProject(root);
	const { createServer } = await import('vite');
	const port = Number(process.env.PORT ?? 5173);
	const vite = await createServer({
		root,
		appType: 'spa',
		server: { middlewareMode: true },
	});
	const server = createHttpServer(async (request, response) => {
		const url = requestUrl(request);
		const match = app.match(url);

		try {
			if (url.pathname === '/__flamefront/data') {
				const entry = await vite.ssrLoadModule('/src/entry-server.ts') as ServerEntry;
				await sendFetchResponse(
					response,
					await requireServerExport(entry, 'loadRouteData')(toRequest(request, url)),
				);
				return;
			}

			if (match?.data.render === 'ssr') {
				const template = await readFile(resolve(root, 'index.html'), 'utf8');
				const transformedTemplate = await vite.transformIndexHtml(url.pathname, template);
				const entry = await vite.ssrLoadModule('/src/entry-server.ts') as ServerEntry;
				send(
					response,
					200,
					await requireServerExport(entry, 'renderSsrDocument')(
						transformedTemplate,
						toRequest(request, url),
					),
					'text/html; charset=utf-8',
				);
				return;
			}

			if (match?.data.render === 'ssg') {
				const entry = await vite.ssrLoadModule('/src/entry-server.ts') as ServerEntry;
				send(
					response,
					200,
					await requireServerExport(entry, 'renderSsgDocument')(toRequest(request, url)),
					'text/html; charset=utf-8',
				);
				return;
			}
		} catch (error) {
			if (error instanceof Response) {
				await sendFetchResponse(response, error);
				return;
			}
			vite.ssrFixStacktrace(error as Error);
			console.error(error);
			send(response, 500, `<pre>${String((error as Error).stack ?? error)}</pre>`, 'text/html; charset=utf-8');
			return;
		}

		vite.middlewares(request, response, (error?: Error) => {
			if (error) {
				vite.ssrFixStacktrace(error);
				console.error(error);
				if (!response.headersSent) {
					send(response, 500, `<pre>${String(error.stack ?? error)}</pre>`, 'text/html; charset=utf-8');
				}
				return;
			}
			if (!response.headersSent) send(response, 404, 'Not found');
		});
	});

	await listen(server, port, 'Flamefront dev server');
	const close = async () => {
		server.close();
		await vite.close();
	};
	process.once('SIGINT', close);
	process.once('SIGTERM', close);
}

export async function previewProject(root = process.cwd()): Promise<void> {
	const port = Number(process.env.PORT ?? 4173);
	const checkToken = process.env.FLAMEFRONT_CHECK_TOKEN;
	const serverEntry = await loadBuiltServer(root);
	if (!serverEntry.default?.fetch) {
		throw new Error('The server build must default-export srvx options with a fetch handler.');
	}

	const { serve } = await import('srvx');
	const checkMiddleware = checkToken
		? async (_request: Request, next: () => Response | Promise<Response>) => {
				const response = await next();
				try {
					response.headers.set('X-Flamefront-Check-Token', checkToken);
					return response;
				} catch {
					const headers = new Headers(response.headers);
					headers.set('X-Flamefront-Check-Token', checkToken);
					return new Response(response.body, {
						headers,
						status: response.status,
						statusText: response.statusText,
					});
				}
			}
		: undefined;
	const server = serve({
		...serverEntry.default,
		port,
		gracefulShutdown: true,
		middleware: [
			checkMiddleware,
			...(serverEntry.default.middleware ?? []),
		].filter(Boolean) as NonNullable<ServerOptions['middleware']>,
	});
	await server.ready();
}
