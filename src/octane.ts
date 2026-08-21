import type { AppDefinition, RouteDefinition } from './index.ts';
import type {
	DocumentMode,
	RouteRuntime,
	RenderedDocument,
	RouteRuntimeContextOptions,
} from './server.ts';
import type { ServerRouterOptions, ServerRouterResult } from './remix-router-core.ts';

export type { DocumentMode, RenderedDocument } from './server.ts';

export interface RouterDocumentProps {
	readonly router: unknown;
	readonly context: unknown;
}

export type RouterDocument = (props: RouterDocumentProps) => unknown;

/** Framework-rendered document pieces available to the app composer. */
export interface DocumentParts {
	readonly template: string;
	readonly body: string;
	readonly css: string;
	readonly hydrationScript: string;
}

export interface DocumentCompositionContext<
	Route extends RouteDefinition = RouteDefinition,
> {
	readonly request: Request;
	readonly mode: DocumentMode;
	readonly route: Route | null;
	readonly params: Readonly<Record<string, string | undefined>>;
	readonly status: number;
}

export type ComposeDocument<
	Route extends RouteDefinition = RouteDefinition,
> = (
	parts: DocumentParts,
	context: DocumentCompositionContext<Route>,
) => string | Promise<string>;

export interface RenderDocumentOptions {
	readonly mode?: DocumentMode;
}

export interface OctaneRenderResult {
	readonly html: string;
	readonly css: string;
}

/**
 * The renderer is injectable so document behavior can be tested without
 * loading the compiler-only Octane and Remix Router source modules in Node.
 */
export interface OctaneRenderer {
	readonly createStaticRouter: (routes: readonly unknown[], context: unknown) => unknown;
	readonly renderToString: (
		component: unknown,
		props: RouterDocumentProps,
	) => OctaneRenderResult;
	readonly defaultRouterDocument: RouterDocument;
}

export interface DocumentRouter {
	readonly routes: readonly unknown[];
	readonly createServerRouter: (
		request: Request,
		options?: ServerRouterOptions,
	) => Promise<Response | ServerRouterResult<unknown, unknown>>;
}

export interface OctaneDocumentsOptions<
	Context = unknown,
	Route extends RouteDefinition = RouteDefinition,
> {
	readonly app: AppDefinition<Route>;
	readonly runtime: RouteRuntime<Context, Route>;
	/** Wrap the framework's default RouterProvider with app providers. */
	readonly routerDocument?: RouterDocument;
	/** Control HTML placement while retaining framework protocol pieces. */
	readonly composeDocument?: ComposeDocument<Route>;
	readonly router?: DocumentRouter;
	readonly renderer?: OctaneRenderer;
}

export interface OctaneDocuments {
	readonly renderDocument: (
		template: string,
		request: Request,
		options?: RenderDocumentOptions,
	) => Promise<RenderedDocument>;
	readonly loadRouteData: (request: Request) => Promise<Response>;
}

interface StaticDocumentContext {
	readonly loaderData?: Record<string, unknown>;
	readonly actionData?: Record<string, unknown> | null;
	readonly errors?: Record<string, unknown> | null;
	readonly statusCode?: number;
	readonly matches?: readonly {
		readonly params?: Readonly<Record<string, string | undefined>>;
		readonly pathname?: string;
		readonly pathnameBase?: string;
		readonly route?: { readonly id?: string };
	}[];
}

function isRouteErrorResponse(value: unknown): value is Record<string, unknown> {
	return Boolean(
		value &&
		typeof value === 'object' &&
		typeof (value as { status?: unknown }).status === 'number' &&
		typeof (value as { statusText?: unknown }).statusText === 'string' &&
		typeof (value as { internal?: unknown }).internal === 'boolean' &&
		'data' in value,
	);
}

export function serializeErrors(
	errors: Record<string, unknown> | null | undefined,
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

export const staticRouterHydrationScriptId = 'flamefront-static-router-hydration';

export function staticRouterHydrationScript(context: StaticDocumentContext): string {
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

export function composeDefaultDocument(
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

function createDefaultRouterDocument(
	createElement: (component: any, props: Record<string, unknown>) => unknown,
	RouterProvider: unknown,
): RouterDocument {
	return ({ router }) => createElement(RouterProvider, { router });
}

async function loadDefaultRouter(): Promise<DocumentRouter> {
	const module = await import('./remix-router.ts');
	return {
		routes: module.routes,
		createServerRouter: module.createServerRouter,
	};
}

async function loadDefaultRenderer(): Promise<OctaneRenderer> {
	const [remix, dom, octane] = await Promise.all([
		import('@octanejs/remix-router'),
		import('@octanejs/remix-router/dom'),
		import('octane/server'),
	]);
	return {
		createStaticRouter: (routes, context) =>
			remix.createStaticRouter(routes as any[], context as any),
		renderToString: (component, props) =>
			octane.renderToString(component as never, props as never),
		defaultRouterDocument: createDefaultRouterDocument(
			octane.createElement,
			dom.RouterProvider,
		),
	};
}

function createShellRouter(
	request: Request,
	app: AppDefinition,
	routeGraph: readonly unknown[],
	renderer: OctaneRenderer,
): { readonly context: StaticDocumentContext; readonly router: unknown } {
	const url = new URL(request.url);
	const rootRoute = routeGraph[0] && typeof routeGraph[0] === 'object'
		? routeGraph[0]
		: {};
	const context: StaticDocumentContext & {
		readonly basename: string;
		readonly location: Record<string, unknown>;
	} = {
		basename: app.routing.basename,
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
			pathnameBase: app.routing.basename,
			route: { ...rootRoute, id: '0' },
		}],
		loaderData: {},
		actionData: null,
		errors: null,
		statusCode: 200,
	};
	return {
		context,
		router: renderer.createStaticRouter(routeGraph, context),
	};
}

function resolveDocumentMode(
	request: Request,
	mode: DocumentMode | undefined,
	route: RouteDefinition | null,
): DocumentMode {
	if (mode) return mode;
	if (new URL(request.url).searchParams.has('__flamefront_shell')) return 'shell';
	if (!route) throw new Response('Not found', { status: 404 });
	return route.render;
}

function assertRouteMode(route: RouteDefinition | null, mode: DocumentMode): void {
	if (mode === 'shell') return;
	if (!route || route.render !== mode) {
		throw new Response('Not found', { status: 404 });
	}
}

function routeData(context: StaticDocumentContext): unknown {
	const leaf = context.matches?.at(-1);
	const routeId = leaf?.route?.id;
	return routeId ? context.loaderData?.[routeId] ?? null : null;
}

export function createOctaneDocuments<
	Context = unknown,
	Route extends RouteDefinition = RouteDefinition,
>(options: OctaneDocumentsOptions<Context, Route>): OctaneDocuments {
	let routerPromise: Promise<DocumentRouter> | undefined;
	let rendererPromise: Promise<OctaneRenderer> | undefined;

	const getRouter = (): Promise<DocumentRouter> => {
		if (options.router) return Promise.resolve(options.router);
		return routerPromise ??= loadDefaultRouter();
	};
	const getRenderer = (): Promise<OctaneRenderer> => {
		if (options.renderer) return Promise.resolve(options.renderer);
		return rendererPromise ??= loadDefaultRenderer();
	};

	const renderDocument = async (
		template: string,
		request: Request,
		renderOptions: RenderDocumentOptions = {},
	): Promise<RenderedDocument> => {
		const routeMatch = options.app.match(request.url);
		const route = routeMatch?.data ?? null;
		const mode = resolveDocumentMode(request, renderOptions.mode, route);
		assertRouteMode(route, mode);

		const contextOptions: RouteRuntimeContextOptions = {
			purpose: 'document',
			mode,
		};
		const requestContext = await options.runtime.createRequestContext(request, contextOptions);
		const [router, renderer] = await Promise.all([getRouter(), getRenderer()]);
		const routerDocument = options.routerDocument ?? renderer.defaultRouterDocument;
		const result = mode === 'shell' || mode === 'client'
			? createShellRouter(request, options.app, router.routes, renderer)
			: await router.createServerRouter(request, {
					basename: options.app.routing.basename,
					requestContext,
				});
		if (result instanceof Response) throw result;

		const staticContext = result.context as StaticDocumentContext;
		const rendered = renderer.renderToString(routerDocument, {
			router: result.router,
			context: result.context,
		});
		const status = staticContext.statusCode ?? 200;
		const compositionContext: DocumentCompositionContext<Route> = {
			request,
			mode,
			route,
			params: routeMatch?.params ?? {},
			status,
		};
		const parts: DocumentParts = {
			template,
			body: rendered.html,
			css: rendered.css,
			hydrationScript: staticRouterHydrationScript(staticContext),
		};
		const html = await (options.composeDocument
			? options.composeDocument(parts, compositionContext)
			: composeDefaultDocument(
				parts.template,
				parts.body,
				parts.css,
				parts.hydrationScript,
			));

		return mode === 'static'
			? { html, routeData: routeData(staticContext), status }
			: { html, status };
	};

	return {
		renderDocument,
		loadRouteData: options.runtime.loadRouteData,
	};
}
