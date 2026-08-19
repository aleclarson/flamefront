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

export function defineRoute<T extends (...args: any[]) => unknown>(
	component: T,
	options: RouteOptions,
): T;
