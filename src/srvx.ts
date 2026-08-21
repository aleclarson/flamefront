import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { staticMiddleware } from 'srvx/static';
import type { ServerMiddleware, ServerOptions } from 'srvx';
import {
	joinBasename,
	stripBasename,
	type AppDefinition,
	type RouteDefinition,
} from './index.ts';
import type { OctaneDocuments } from './octane.ts';
import type { DocumentMode, RenderedDocument } from './server.ts';

export type SrvxMiddleware = ServerMiddleware;

export interface TemplateContext<Route extends RouteDefinition = RouteDefinition> {
	readonly request: Request;
	readonly route: Route | null;
	readonly mode: DocumentMode;
}

export type TemplateLoader<Route extends RouteDefinition = RouteDefinition> = (
	context: TemplateContext<Route>,
) => string | Promise<string>;

export interface ServerAssets<Route extends RouteDefinition = RouteDefinition> {
	readonly clientDirectory: string | URL;
	readonly loadTemplate?: TemplateLoader<Route>;
}

export interface ResponseHeadersContext<
	Route extends RouteDefinition = RouteDefinition,
> {
	readonly request: Request;
	readonly route: Route | null;
	readonly mode: DocumentMode;
	readonly document: RenderedDocument;
}

export type ResponseHeaders = HeadersInit;

export type ResponseHeadersHook<Route extends RouteDefinition = RouteDefinition> = (
	context: ResponseHeadersContext<Route>,
) => ResponseHeaders | Promise<ResponseHeaders>;

export interface ServerEntryLifecycle {
	readonly renderDocument: OctaneDocuments['renderDocument'];
	readonly loadRouteData: OctaneDocuments['loadRouteData'];
}

export type FlamefrontServerEntry = ServerOptions & ServerEntryLifecycle;

export interface SrvxServerEntryOptions<
	Route extends RouteDefinition = RouteDefinition,
> {
	readonly app: AppDefinition<Route>;
	readonly documents: Pick<OctaneDocuments, 'renderDocument' | 'loadRouteData'>;
	readonly assets: ServerAssets<Route>;
	/** Applied outermost first, in declaration order, around framework transport. */
	readonly middleware?: readonly SrvxMiddleware[];
	readonly headers?: ResponseHeadersHook<Route>;
}

function asPath(directory: string | URL): string {
	return directory instanceof URL ? fileURLToPath(directory) : directory;
}

async function loadDefaultTemplate(clientDirectory: string): Promise<string> {
	let lastError: unknown;
	const candidates = [
		resolve(clientDirectory, '..', 'server', 'index.html'),
		resolve(clientDirectory, 'index.html'),
		resolve(clientDirectory, '..', 'index.html'),
	];

	for (const filename of candidates) {
		try {
			return await readFile(filename, 'utf8');
		} catch (error) {
			lastError = error;
		}
	}

	throw lastError;
}

function mergeHeaders(target: Headers, source: HeadersInit | undefined): void {
	if (source === undefined) return;
	for (const [name, value] of new Headers(source)) target.set(name, value);
}

function staticRequest(request: Request, basename: string): Request {
	if (basename === '/' || (request.method !== 'GET' && request.method !== 'HEAD')) {
		return request;
	}

	const url = new URL(request.url);
	const pathname = stripBasename(url.pathname, basename);
	if (!pathname || pathname === url.pathname) return request;
	url.pathname = pathname;
	return new Request(url, request);
}

/**
 * Compose the srvx transport and the mode-aware document/data lifecycle into
 * the one default server entry consumed by Flamefront's lifecycle.
 */
export function createSrvxServerEntry<
	Route extends RouteDefinition = RouteDefinition,
>(options: SrvxServerEntryOptions<Route>): FlamefrontServerEntry {
	const clientDirectory = asPath(options.assets.clientDirectory);
	const loadTemplate = options.assets.loadTemplate ?? (() => loadDefaultTemplate(clientDirectory));
	const serveClientFile = staticMiddleware({ dir: clientDirectory });
	const defaultClientRoute = options.app.routes.find((route) => route.render === 'client');

	const frameworkMiddleware: SrvxMiddleware = (request, next) => {
		const url = new URL(request.url);
		if (url.pathname === options.app.routing.dataPath) return next();

		const match = options.app.match(url);
		if (url.pathname === options.app.routing.basename && !match) return next();
		if (match?.data.render === 'client' || match?.data.render === 'server') return next();
		return serveClientFile(staticRequest(request, options.app.routing.basename), next);
	};

	const fetch = async (request: Request): Promise<Response> => {
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
				return options.documents.loadRouteData(request);
			}

			if (!match) return new Response('Not found', { status: 404 });

			const mode: DocumentMode = url.searchParams.has('__flamefront_shell')
				? 'shell'
				: match.data.render;
			const template = await loadTemplate({
				request,
				route: match.data,
				mode,
			});
			const document = await options.documents.renderDocument(template, request, { mode });
			const responseHeaders = new Headers({
				'Content-Type': 'text/html; charset=utf-8',
			});
			mergeHeaders(responseHeaders, document.headers);
			if (options.headers) {
				mergeHeaders(responseHeaders, await options.headers({
					request,
					route: match.data,
					mode,
					document,
				}));
			}

			return new Response(document.html, {
				status: document.status ?? 200,
				headers: responseHeaders,
			});
		} catch (error) {
			if (error instanceof Response) return error;
			throw error;
		}
	};

	return {
		fetch,
		middleware: [
			...(options.middleware ?? []),
			frameworkMiddleware,
		],
		renderDocument: options.documents.renderDocument,
		loadRouteData: options.documents.loadRouteData,
	};
}
