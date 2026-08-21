import { joinBasename, stripBasename as stripAppBasename } from './index.ts';

export interface ClientLoaderArgs {
	readonly request: Request;
}

export interface RouteDataOptions {
	readonly basename?: string;
	readonly dataPath?: string;
}

/** Load route data through Flamefront's server endpoint during browser navigation. */
export async function loadRouteData(
	{ request }: ClientLoaderArgs,
	options: RouteDataOptions = {},
): Promise<unknown> {
	const endpoint = new URL(options.dataPath ?? '/__flamefront/data', request.url);
	endpoint.searchParams.set('url', request.url);
	const response = await fetch(endpoint, { signal: request.signal });
	if (!response.ok) {
		throw new Error(`flamefront loader request failed with ${response.status}.`);
	}
	return response.json();
}

function staticRouteDataPath(request: Request, basename = '/'): string {
	const appPathname = stripAppBasename(
		new URL(request.url).pathname,
		basename,
	) ?? new URL(request.url).pathname;
	const pathname = joinBasename(basename, appPathname).replace(/\/+$/, '');
	return pathname === '' ? '/index.data.json' : `${pathname}/index.data.json`;
}

/** Load a build-time static route artifact during browser navigation. */
export async function loadStaticRouteData(
	{ request }: ClientLoaderArgs,
	options: RouteDataOptions = {},
): Promise<unknown> {
	const url = new URL(staticRouteDataPath(request, options.basename), request.url);
	const response = await fetch(url, { signal: request.signal });
	if (!response.ok) {
		throw new Error(`flamefront static route data request failed with ${response.status}.`);
	}
	return response.json();
}
