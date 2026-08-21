import {
	createRemixRouterAdapter,
	type ServerRouterOptions,
	type ServerRouterResult,
} from './remix-router-core.ts';
import {
	createBrowserRouter,
	createStaticHandler,
	createStaticRouter,
} from '@octanejs/remix-router';
import type { HydrationState } from '@octanejs/remix-router';
import type { AppDefinition, LoadRouteOptions, RouteDefinition } from './index.ts';
import {
	preloadRoute as preloadGeneratedRoute,
	routes,
	routing,
} from 'virtual:flamefront/remix-routes';

export { routes, routing };
export { createRemixRouterAdapter };
export type { ServerRouterOptions, ServerRouterResult };

export const staticRouterHydrationScriptId = 'flamefront-static-router-hydration';

/** Read and remove the hydration payload emitted by the server document adapter. */
export function consumeStaticRouterHydrationData(): HydrationState | undefined {
	const data = (window as typeof window & {
		__staticRouterHydrationData?: unknown;
	}).__staticRouterHydrationData;
	document.getElementById(staticRouterHydrationScriptId)?.remove();
	return data as HydrationState | undefined;
}

const adapter = createRemixRouterAdapter(routes, {
	createBrowserRouter,
	createStaticHandler,
	createStaticRouter,
}, routing);

export const createClientRouter = adapter.createClientRouter;
export const createServerRouter = adapter.createServerRouter;

/** Prefetch route data and the generated client modules used by navigation. */
export async function prefetchRoute<
	Route extends RouteDefinition = RouteDefinition,
>(
	app: Pick<AppDefinition<Route>, 'match' | 'prefetch'>,
	url: string | URL,
	options?: LoadRouteOptions,
): Promise<void> {
	const match = app.match(url);
	if (!match) return;

	await Promise.all([
		app.prefetch(url, options),
		preloadGeneratedRoute(match.data.entry),
	]);
}
