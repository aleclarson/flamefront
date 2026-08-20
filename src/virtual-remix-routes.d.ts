declare module 'virtual:flamefront/remix-routes' {
	import type { RouteObject } from '@octanejs/remix-router';

	export const routes: RouteObject[];
}

declare module 'virtual:flamefront/server-routes' {
	import type { RouteModule } from './server.ts';

	export function importRoute(entry: string): Promise<RouteModule>;
}
