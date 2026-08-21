import {
	createRouteDataClient,
	type RouteDataLoadOptions,
	type RouteDataRoutingOptions,
} from './route-data-client.ts';

export {
	createRouteDataClient,
	type RouteDataClient,
	type RouteDataLoadOptions,
	type RouteDataRoutingOptions,
	type RouteDataSource,
} from './route-data-client.ts';

export interface ClientLoaderArgs {
	readonly request: Request;
}

export interface RouteDataOptions {
	readonly basename?: string;
	readonly dataPath?: string;
}

function client(options: RouteDataOptions) {
	return createRouteDataClient(options satisfies RouteDataRoutingOptions);
}

/** Load route data through Flamefront's server endpoint during browser navigation. */
export async function loadRouteData(
	{ request }: ClientLoaderArgs,
	options: RouteDataOptions = {},
): Promise<unknown> {
	const loadOptions: RouteDataLoadOptions = { signal: request.signal };
	return client(options).load(request.url, 'live', loadOptions);
}

/** Load a build-time static route artifact during browser navigation. */
export async function loadStaticRouteData(
	{ request }: ClientLoaderArgs,
	options: RouteDataOptions = {},
): Promise<unknown> {
	const loadOptions: RouteDataLoadOptions = { signal: request.signal };
	return client(options).load(request.url, 'static', loadOptions);
}
