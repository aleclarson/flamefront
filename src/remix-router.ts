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
import { routes } from 'virtual:flamefront/remix-routes';

export { routes };
export { createRemixRouterAdapter };
export type { ServerRouterOptions, ServerRouterResult };

const adapter = createRemixRouterAdapter(routes, {
	createBrowserRouter,
	createStaticHandler,
	createStaticRouter,
});

export const createClientRouter = adapter.createClientRouter;
export const createServerRouter = adapter.createServerRouter;
