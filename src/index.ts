import { normalizeRouteOptions } from './route-definition.ts';

export type RenderMode = 'ssr' | 'ssg' | 'spa';
export type HydrationMode = 'full' | 'deferred' | 'none';

export interface RouteOptions {
	path: string;
	render?: RenderMode;
	hydration?: HydrationMode;
}

export interface RouteDefinition extends RouteOptions {
	/** Octane/Vite project-root module ID, such as `/src/Home.tsrx`. */
	entry: string;
	/** The component's ESM export name. */
	component: string;
	render: RenderMode;
}

/**
 * Associate static route metadata with an Octane component.
 *
 * Flamefront's Vite plugin extracts and erases top-level calls at compile time.
 * The small runtime implementation keeps untransformed modules predictable.
 */
export function defineRoute<T extends (...args: any[]) => unknown>(
	component: T,
	options: RouteOptions,
): T {
	if (typeof component !== 'function') {
		throw new TypeError('flamefront defineRoute() requires a component function.');
	}
	normalizeRouteOptions(options);
	return component;
}
