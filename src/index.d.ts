export type RenderMode = 'ssr' | 'ssg' | 'spa';
export type HydrationMode = 'full' | 'deferred' | 'none';

export interface RouteOptions {
	render?: RenderMode;
	hydration?: HydrationMode;
	navLabel?: string;
	label?: string;
	[key: string]: unknown;
}

export interface RouteDefinition extends RouteOptions {
	path: string;
	/** Octane/Vite project-root module ID, such as `/src/Home.tsrx`. */
	entry: string;
	render: RenderMode;
}

export interface AppDefinition {
	readonly routes: readonly RouteDefinition[];
	[key: string]: unknown;
}

export function route(path: string, entry: string, options?: RouteOptions): RouteDefinition;
export function defineApp(options: { routes: readonly RouteDefinition[] } & Record<string, unknown>): AppDefinition;
export function routesFor(app: AppDefinition, render: RenderMode): readonly RouteDefinition[];
