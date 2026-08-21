import type { Match } from '@remix-run/route-pattern/match';
import {
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

/** Inputs for constructing one request-scoped value for route work. */
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

/** Import a generated or application-provided route module by its entry ID. */
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
	/** Build request context for data requests and document router queries. */
	readonly requestContext?: RequestContextFactory<Context, Route>;
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
