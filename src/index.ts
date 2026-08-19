export type RenderMode = 'ssr' | 'ssg' | 'spa';
export type HydrationMode = 'full' | 'deferred' | 'none';

export interface RouteOptions {
	readonly render?: RenderMode;
	readonly hydration?: HydrationMode;
}

export interface RouteDefinition extends RouteOptions {
	readonly path: string;
	/** Octane/Vite project-root module ID, such as `/src/Home.tsrx`. */
	readonly entry: string;
	readonly render: RenderMode;
}

export interface AppDefinition {
	readonly routes: readonly RouteDefinition[];
}

const renderModes: ReadonlySet<unknown> = new Set<RenderMode>(['ssr', 'ssg', 'spa']);
const hydrationModes: ReadonlySet<unknown> = new Set<HydrationMode>([
	'full',
	'deferred',
	'none',
]);

function assertString(value: unknown, name: string): asserts value is string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`flamefront ${name} must be a non-empty string.`);
	}
}

function validateRoute(routeDefinition: RouteDefinition, index: number): void {
	if (!routeDefinition || typeof routeDefinition !== 'object') {
		throw new TypeError(`flamefront route ${index + 1} must be an object.`);
	}

	assertString(routeDefinition.path, `route ${index + 1} path`);
	if (!routeDefinition.path.startsWith('/')) {
		throw new TypeError(`flamefront route ${index + 1} path must start with '/'.`);
	}
	assertString(routeDefinition.entry, `route ${index + 1} entry`);

	if (!renderModes.has(routeDefinition.render)) {
		throw new TypeError(
			`flamefront route ${index + 1} render must be 'ssr', 'ssg', or 'spa'.`,
		);
	}
	if (routeDefinition.hydration !== undefined && !hydrationModes.has(routeDefinition.hydration)) {
		throw new TypeError(
			`flamefront route ${index + 1} hydration must be 'full', 'deferred', or 'none'.`,
		);
	}
}

/** Define one explicit route without relying on a filesystem convention. */
export function route(
	path: string,
	entry: string,
	options: RouteOptions = {},
): RouteDefinition {
	const definition: RouteDefinition = {
		path,
		entry,
		...options,
		render: options.render ?? 'ssr',
	};
	validateRoute(definition, 0);
	return Object.freeze(definition);
}

/** Normalize and validate the application's explicit route graph. */
export function defineApp<T extends AppDefinition>(options: T): T {
	if (!options || !Array.isArray(options.routes)) {
		throw new TypeError('flamefront defineApp() requires a routes array.');
	}

	const seenPaths = new Set<string>();
	const routes = options.routes.map((routeDefinition, index) => {
		validateRoute(routeDefinition, index);
		if (seenPaths.has(routeDefinition.path)) {
			throw new TypeError(`flamefront route path is duplicated: ${routeDefinition.path}`);
		}
		seenPaths.add(routeDefinition.path);
		return routeDefinition;
	});

	return Object.freeze({
		...options,
		routes: Object.freeze(routes),
	}) as T;
}

/** Select routes for one render mode. */
export function routesFor(
	app: AppDefinition,
	render: RenderMode,
): readonly RouteDefinition[] {
	return app.routes.filter((routeDefinition) => routeDefinition.render === render);
}
