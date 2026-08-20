import { isRouteErrorResponse, createStaticRouter } from '@octanejs/remix-router';
import { RouterProvider } from '@octanejs/remix-router/dom';
import { createElement, renderToString } from 'octane/server';
import { importRoute as generatedImportRoute } from 'virtual:flamefront/server-routes';
import type { ServerOptions } from 'srvx';
import type { AppDefinition } from './index.ts';
import {
	createServerRouter,
	routes as routeGraph,
	staticRouterHydrationScriptId,
} from './remix-router.ts';
import {
	createSrvxServer,
	loadRoute,
	type RenderedDocument,
	type RouteModule,
} from './server.ts';

export interface RouterDocumentProps {
	readonly router: unknown;
	readonly context: unknown;
}

export type RouterDocument = (props: RouterDocumentProps) => unknown;

export interface OctaneServerOptions {
	readonly app: AppDefinition;
	readonly clientDirectory: string | URL;
	readonly routerDocument?: RouterDocument;
	readonly importRoute?: (entry: string) => Promise<RouteModule>;
}

export interface OctaneServerEntry {
	readonly server: ServerOptions;
	readonly loadRouteData: (request: Request) => Promise<Response>;
	readonly renderSsrDocument: (template: string, request: Request) => Promise<string>;
	readonly renderSsgDocument: (
		template: string,
		request: Request,
	) => Promise<RenderedDocument>;
}

function DefaultRouterDocument({ router }: RouterDocumentProps): unknown {
	return createElement(RouterProvider as any, { router });
}

function serializeErrors(
	errors: Record<string, unknown> | null,
): Record<string, unknown> | null {
	if (!errors) return null;
	const serialized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(errors)) {
		if (isRouteErrorResponse(value)) {
			serialized[key] = { ...value, __type: 'RouteErrorResponse' };
		} else if (value instanceof Error) {
			serialized[key] = {
				message: value.message,
				__type: 'Error',
				...(value.name !== 'Error' ? { __subType: value.name } : {}),
			};
		} else {
			serialized[key] = value;
		}
	}
	return serialized;
}

function staticRouterHydrationScript(context: any): string {
	const data = JSON.stringify({
		loaderData: context.loaderData,
		actionData: context.actionData,
		errors: serializeErrors(context.errors),
	});
	const escaped = JSON.stringify(data).replace(/[&><\u2028\u2029]/g, (character) => {
		const escapes: Record<string, string> = {
			'&': '\\u0026',
			'>': '\\u003e',
			'<': '\\u003c',
			' ': '\\u2028',
			' ': '\\u2029',
		};
		return escapes[character] ?? character;
	});
	return `<script id="${staticRouterHydrationScriptId}">window.__staticRouterHydrationData = JSON.parse(${escaped});</script>`;
}

function addRenderedBody(
	template: string,
	body: string,
	css: string,
	hydrationScript: string,
): string {
	const root = '<div id="root"></div>';

	if (!template.includes(root)) {
		throw new Error('The HTML shell must contain an empty <div id="root"></div>.');
	}

	return template
		.replace(root, `<div id="root">${body}</div>`)
		.replace('</head>', `${css}</head>`)
		.replace('</body>', `${hydrationScript}</body>`);
}

async function createShellRouter(request: Request) {
	const url = new URL(request.url);
	const context = {
		basename: '/',
		location: {
			pathname: url.pathname,
			search: url.search,
			hash: url.hash,
			state: null,
			key: 'default',
		},
		matches: [{
			params: {},
			pathname: '',
			pathnameBase: '/',
			route: { ...routeGraph[0], id: '0' },
		}],
		loaderData: {},
		actionData: null,
		errors: null,
		statusCode: 200,
		loaderHeaders: {},
		actionHeaders: {},
	};
	return {
		context,
		router: createStaticRouter(routeGraph, context as any),
	};
}

export function createOctaneServer(options: OctaneServerOptions): OctaneServerEntry {
	const routerDocument = options.routerDocument ?? DefaultRouterDocument;
	const importRoute = options.importRoute ?? generatedImportRoute;

	async function renderSsrDocument(template: string, request: Request): Promise<string> {
		const route = options.app.match(request.url)?.data;
		const shellRequest = new URL(request.url).searchParams.has('__flamefront_shell');
		if (!shellRequest && (!route || (route.render !== 'client' && route.render !== 'server'))) {
			throw new Response('Not found', { status: 404 });
		}

		const result = shellRequest || route?.render === 'client'
			? await createShellRouter(request)
			: await createServerRouter(request);
		if (result instanceof Response) throw result;
		const { html, css } = renderToString(routerDocument as never, {
			router: result.router,
			context: result.context,
		});
		return addRenderedBody(template, html, css, staticRouterHydrationScript(result.context));
	}

	async function renderSsgDocument(
		template: string,
		request: Request,
	): Promise<RenderedDocument> {
		const route = options.app.match(request.url)?.data;
		if (!route || route.render !== 'static') throw new Response('Not found', { status: 404 });
		const result = await createServerRouter(request);
		if (result instanceof Response) throw result;
		const { html, css } = renderToString(routerDocument as never, {
			router: result.router,
			context: result.context,
		});
		const leaf = result.context.matches.at(-1);
		return {
			html: addRenderedBody(template, html, css, staticRouterHydrationScript(result.context)),
			routeData: leaf?.route.id ? result.context.loaderData[leaf.route.id] ?? null : null,
			status: result.context.statusCode,
		};
	}

	async function loadRouteData(request: Request): Promise<Response> {
		const requestUrl = new URL(request.url);
		const routeUrl = requestUrl.searchParams.get('url');
		if (!routeUrl) return new Response('Missing route URL.', { status: 400 });

		const loaded = await loadRoute(
			options.app,
			new Request(routeUrl, { headers: request.headers, signal: request.signal }),
			importRoute,
		);
		if (!loaded) return new Response('Not found.', { status: 404 });
		return Response.json(loaded.loaderData ?? null);
	}

	return {
		server: createSrvxServer({
			app: options.app,
			clientDirectory: options.clientDirectory,
			loadRouteData,
			renderSsrDocument,
			renderSsgDocument,
		}),
		loadRouteData,
		renderSsrDocument,
		renderSsgDocument,
	};
}
