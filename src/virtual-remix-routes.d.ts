declare module 'virtual:flamefront/remix-routes' {
	import type { RouteObject } from '@octanejs/remix-router';
	import type { NormalizedRoutingOptions } from './index.ts';

	export const routes: RouteObject[];
	export const routing: NormalizedRoutingOptions;
}

declare module 'virtual:flamefront/server-routes' {
	import type { RouteModule } from './server.ts';

	export function importRoute(entry: string): Promise<RouteModule>;
}
