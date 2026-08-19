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
