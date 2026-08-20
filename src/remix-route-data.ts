export interface ClientLoaderArgs {
	readonly request: Request;
}

/** Load route data through Flamefront's server endpoint during browser navigation. */
export async function loadRouteData({ request }: ClientLoaderArgs): Promise<unknown> {
	const endpoint = new URL('/__flamefront/data', request.url);
	endpoint.searchParams.set('url', request.url);
	const response = await fetch(endpoint, { signal: request.signal });
	if (!response.ok) {
		throw new Error(`flamefront loader request failed with ${response.status}.`);
	}
	return response.json();
}

function staticRouteDataPath(request: Request): string {
	const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
	return pathname === '' ? '/index.data.json' : `${pathname}/index.data.json`;
}

/** Load a build-time static route artifact during browser navigation. */
export async function loadStaticRouteData({ request }: ClientLoaderArgs): Promise<unknown> {
	const url = new URL(staticRouteDataPath(request), request.url);
	const response = await fetch(url, { signal: request.signal });
	if (!response.ok) {
		throw new Error(`flamefront static route data request failed with ${response.status}.`);
	}
	return response.json();
}
