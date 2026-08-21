import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { staticMiddleware } from 'srvx/static';
import type { ServerOptions } from 'srvx';
import type { Match } from '@remix-run/route-pattern/match';
import {
	joinBasename,
	type AppDefinition,
	type MatchRouteOptions,
	type RenderMode,
	type RouteDefinition,
} from './index.ts';

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

export type DocumentMode = 'shell' | RenderMode;
export type RequestPurpose = 'data' | 'document';

export interface RequestContextArgs<Route extends RouteDefinition = RouteDefinition> {
	readonly request: Request;
	readonly route: Route | null;
	readonly params: Readonly<Record<string, string | undefined>>;
	readonly purpose: RequestPurpose;
	readonly mode?: DocumentMode;
}

export type RequestContextFactory<
	Context = unknown,
	Route extends RouteDefinition = RouteDefinition,
> = (args: RequestContextArgs<Route>) => Context | Promise<Context>;

export type RouteImporter<Data = unknown, Context = unknown> = (
	entry: string,
) => Promise<RouteModule<Data, Context>>;

export interface RenderedDocument {
	readonly html: string;
	readonly routeData?: unknown;
	readonly status?: number;
	readonly headers?: HeadersInit;
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

export interface RouteRuntimeContextOptions {
	readonly purpose: RequestPurpose;
	readonly mode?: DocumentMode;
}

export interface RouteLoadOptions<Context = unknown> {
	readonly context?: Context;
	readonly mode?: DocumentMode;
}

export interface RouteRuntime<
	Context = unknown,
	Route extends RouteDefinition = RouteDefinition,
> {
	readonly app: AppDefinition<Route>;
	readonly importRoute: RouteImporter<unknown, Context>;
	readonly match: (
		url: string | URL,
		options?: MatchRouteOptions,
	) => Match<string, Route> | null;
	readonly createRequestContext: (
		request: Request,
		options: RouteRuntimeContextOptions,
	) => Promise<Context | undefined>;
	readonly loadRoute: (
		request: Request,
		options?: RouteLoadOptions<Context>,
	) => Promise<LoadedRoute<unknown, Context, Route> | null>;
	readonly loadRouteData: (request: Request) => Promise<Response>;
}

export interface RouteRuntimeOptions<
	Context = unknown,
	Route extends RouteDefinition = RouteDefinition,
> {
	readonly app: AppDefinition<Route>;
	readonly importRoute: RouteImporter<unknown, Context>;
	readonly requestContext?: RequestContextFactory<Context, Route>;
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
				if (url.pathname === options.app.routing.basename && !match) return next();
				if (match?.data.render === 'client' || match?.data.render === 'server') return next();
				return serveClientFile(request, next);
			},
		],
		async fetch(request) {
			const url = new URL(request.url);
			const match = options.app.match(url);

			try {
				if (
					url.pathname === options.app.routing.basename &&
					!match &&
					defaultClientRoute
				) {
					return new Response(null, {
						status: 302,
						headers: {
							Location: joinBasename(options.app.routing.basename, defaultClientRoute.path),
						},
					});
				}
				if (url.pathname === options.app.routing.dataPath) {
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

async function loadMatchedRoute<
	Data = unknown,
	Context = unknown,
	Route extends RouteDefinition = RouteDefinition,
>(
	match: Match<string, Route>,
	request: Request,
	importRoute: RouteImporter<Data, Context>,
	context?: Context,
): Promise<LoadedRoute<Data, Context, Route>> {
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

export function createRouteRuntime<
	Context = unknown,
	Route extends RouteDefinition = RouteDefinition,
>(options: RouteRuntimeOptions<Context, Route>): RouteRuntime<Context, Route> {
	const createRequestContext = async (
		request: Request,
		contextOptions: RouteRuntimeContextOptions,
		match = options.app.match(request.url),
	): Promise<Context | undefined> => {
		if (!options.requestContext) return undefined;
		return options.requestContext({
			request,
			route: match?.data ?? null,
			params: match?.params ?? {},
			purpose: contextOptions.purpose,
			...(contextOptions.mode === undefined ? {} : { mode: contextOptions.mode }),
		});
	};

	const loadRouteForRequest = async (
		request: Request,
		loadOptions: RouteLoadOptions<Context> = {},
	): Promise<LoadedRoute<unknown, Context, Route> | null> => {
		const match = options.app.match(request.url);
		if (!match) return null;
		const context = 'context' in loadOptions
			? loadOptions.context
			: await createRequestContext(request, { purpose: 'data', mode: loadOptions.mode }, match);
		return loadMatchedRoute(match, request, options.importRoute, context);
	};

	const loadRouteData = async (request: Request): Promise<Response> => {
		const routeUrl = new URL(request.url).searchParams.get('url');
		if (!routeUrl) return new Response('Missing route URL.', { status: 400 });

		const loaded = await loadRouteForRequest(
			new Request(routeUrl, {
				method: 'GET',
				headers: request.headers,
				signal: request.signal,
			}),
		);
		if (!loaded) return new Response('Not found.', { status: 404 });
		return Response.json(loaded.loaderData ?? null);
	};

	return {
		app: options.app,
		importRoute: options.importRoute,
		match: options.app.match,
		createRequestContext: (request, contextOptions) =>
			createRequestContext(request, contextOptions),
		loadRoute: loadRouteForRequest,
		loadRouteData,
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
	return loadMatchedRoute(match, request, importRoute, context);
}
