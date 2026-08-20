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
import { routes } from 'virtual:flamefront/remix-routes';

export { routes };
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
});

export const createClientRouter = adapter.createClientRouter;
export const createServerRouter = adapter.createServerRouter;
