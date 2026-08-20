import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { staticMiddleware } from 'srvx/static';
import type { ServerOptions } from 'srvx';
import type { AppDefinition, RouteDefinition } from './index.ts';

export interface LoaderArgs<Context = unknown> {
	readonly request: Request;
	readonly params: Readonly<Record<string, string | undefined>>;
	readonly context: Context;
}

export type Loader<Data = unknown, Context = unknown> = (
	args: LoaderArgs<Context>,
) => Data | Promise<Data>;

export interface RouteModule<Data = unknown, Context = unknown> {
	readonly default: unknown;
	readonly loader?: Loader<Data, Context>;
}

export interface RenderedDocument {
	readonly html: string;
	readonly routeData?: unknown;
	readonly status?: number;
}

export type RenderDocumentResult = string | RenderedDocument;

export interface LoadedRoute<
	Data = unknown,
	Context = unknown,
	Route extends RouteDefinition = RouteDefinition,
> {
	readonly route: Route;
	readonly module: RouteModule<Data, Context>;
	readonly loaderData: Data | undefined;
}

export interface SrvxServerOptions {
	readonly app: AppDefinition;
	readonly clientDirectory: string | URL;
	readonly loadRouteData: (request: Request) => Response | Promise<Response>;
	readonly renderSsrDocument: (
		template: string,
		request: Request,
	) => RenderDocumentResult | Promise<RenderDocumentResult>;
	readonly renderSsgDocument: (
		template: string,
		request: Request,
	) => RenderDocumentResult | Promise<RenderDocumentResult>;
}

function documentParts(document: RenderDocumentResult): {
	readonly html: string;
	readonly status: number;
} {
	if (typeof document === 'string') return { html: document, status: 200 };
	return { html: document.html, status: document.status ?? 200 };
}

export function createSrvxServer(options: SrvxServerOptions): ServerOptions {
	const clientDirectory = options.clientDirectory instanceof URL
		? fileURLToPath(options.clientDirectory)
		: options.clientDirectory;
	const documentTemplate = async () => {
		try {
			return await readFile(resolve(clientDirectory, '..', 'server', 'index.html'), 'utf8');
		} catch {
			return readFile(`${clientDirectory}/index.html`, 'utf8');
		}
	};
	const serveClientFile = staticMiddleware({ dir: clientDirectory });
	const defaultClientRoute = options.app.routes.find((route) => route.render === 'client');

	return {
		middleware: [
			(request, next) => {
				const url = new URL(request.url);
				const match = options.app.match(url);
				if (url.pathname === '/' && !match) return next();
				if (match?.data.render === 'client' || match?.data.render === 'server') return next();
				return serveClientFile(request, next);
			},
		],
		async fetch(request) {
			const url = new URL(request.url);
			const match = options.app.match(url);

			try {
				if (url.pathname === '/' && !match && defaultClientRoute) {
					return new Response(null, {
						status: 302,
						headers: { Location: defaultClientRoute.path },
					});
				}
				if (url.pathname === '/__flamefront/data') {
					return options.loadRouteData(request);
				}
				if (match?.data.render === 'server') {
					const document = documentParts(
						await options.renderSsrDocument(await documentTemplate(), request),
					);
					return new Response(document.html, {
						status: document.status,
						headers: { 'Content-Type': 'text/html; charset=utf-8' },
					});
				}
				if (match?.data.render === 'client') {
					const document = documentParts(
						await options.renderSsrDocument(await documentTemplate(), request),
					);
					return new Response(document.html, {
						status: document.status,
						headers: { 'Content-Type': 'text/html; charset=utf-8' },
					});
				}
				if (match?.data.render === 'static') {
					const document = documentParts(
						await options.renderSsgDocument(await documentTemplate(), request),
					);
					return new Response(document.html, {
						status: document.status,
						headers: { 'Content-Type': 'text/html; charset=utf-8' },
					});
				}
				return new Response('Not found', { status: 404 });
			} catch (error) {
				if (error instanceof Response) return error;
				throw error;
			}
		},
	};
}

export async function loadRoute<
	Data = unknown,
	Context = unknown,
	Route extends RouteDefinition = RouteDefinition,
>(
	app: AppDefinition<Route>,
	request: Request,
	importRoute: (entry: string) => Promise<RouteModule<Data, Context>>,
	context?: Context,
): Promise<LoadedRoute<Data, Context, Route> | null> {
	const match = app.match(request.url);
	if (!match) return null;

	const routeModule = await importRoute(match.data.entry);
	const loaderData = routeModule.loader
		? await routeModule.loader({
				request,
				params: match.params,
				context: context as Context,
			})
		: undefined;

	return {
		route: match.data,
		module: routeModule,
		loaderData,
	};
}
