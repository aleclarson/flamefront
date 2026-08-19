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

export interface LoadedRoute<
	Data = unknown,
	Context = unknown,
	Route extends RouteDefinition = RouteDefinition,
> {
	readonly route: Route;
	readonly module: RouteModule<Data, Context>;
	readonly loaderData: Data | undefined;
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
