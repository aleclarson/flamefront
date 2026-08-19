import {
	createMultiMatcher,
	type Match,
	type MultiMatcher,
} from '@remix-run/route-pattern/match';

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

export interface LayoutDefinition<
	Children extends readonly RouteConfig[] = readonly RouteConfig[],
> {
	readonly kind: 'layout';
	/** Octane/Vite project-root module ID for the pathless layout component. */
	readonly entry: string;
	readonly children: Children;
}

export type RouteConfig = RouteDefinition | LayoutDefinition;

export interface MatchRouteOptions {
	readonly render?: RenderMode;
}

export interface LoadRouteOptions {
	readonly signal?: AbortSignal;
	readonly reload?: boolean;
}

export interface AppDefinition<T extends RouteDefinition = RouteDefinition> {
	readonly routes: readonly T[];
	readonly routeTree: readonly RouteConfig[];
	readonly match: (url: string | URL, options?: MatchRouteOptions) => Match<string, T> | null;
	readonly load: <Data = unknown>(url: string | URL, options?: LoadRouteOptions) => Promise<Data>;
	readonly prefetch: (url: string | URL, options?: LoadRouteOptions) => Promise<void>;
}

const renderModes: ReadonlySet<unknown> = new Set<RenderMode>(['ssr', 'ssg', 'spa']);
const hydrationModes: ReadonlySet<unknown> = new Set<HydrationMode>([
	'full',
	'deferred',
	'none',
]);
const matcherCache = new WeakMap<
	readonly RouteDefinition[],
	Map<RenderMode | undefined, MultiMatcher<RouteDefinition>>
>();

function resolveDataUrl(url: string | URL): URL {
	const browserOrigin = typeof location === 'undefined' ? undefined : location.origin;
	if (!browserOrigin && typeof url === 'string' && !URL.canParse(url)) {
		throw new TypeError('flamefront app.load() requires an absolute URL outside the browser.');
	}
	return new URL(url, browserOrigin);
}

function createRouteDataLoader() {
	const cache = new Map<string, Promise<unknown>>();

	return function load<Data = unknown>(
		url: string | URL,
		options: LoadRouteOptions = {},
	): Promise<Data> {
		const routeUrl = resolveDataUrl(url);
		const cacheKey = `${routeUrl.pathname}${routeUrl.search}`;
		const cached = options.reload ? undefined : cache.get(cacheKey);
		if (cached) return cached as Promise<Data>;

		const endpoint = new URL('/__flamefront/data', routeUrl.origin);
		endpoint.searchParams.set('url', routeUrl.href);
		const pending = fetch(endpoint, { signal: options.signal }).then(async (response) => {
			if (!response.ok) {
				throw new Error(`flamefront loader request failed with ${response.status}.`);
			}
			return response.json() as Promise<Data>;
		});
		cache.set(cacheKey, pending);
		void pending.catch(() => cache.delete(cacheKey));
		return pending;
	};
}

function assertString(value: unknown, name: string): asserts value is string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`flamefront ${name} must be a non-empty string.`);
	}
}

function validateRoute(routeDefinition: RouteDefinition, location: string): void {
	if (!routeDefinition || typeof routeDefinition !== 'object') {
		throw new TypeError(`flamefront route ${location} must be an object.`);
	}

	assertString(routeDefinition.path, `route ${location} path`);
	if (!routeDefinition.path.startsWith('/')) {
		throw new TypeError(`flamefront route ${location} path must start with '/'.`);
	}
	assertString(routeDefinition.entry, `route ${location} entry`);

	if (!renderModes.has(routeDefinition.render)) {
		throw new TypeError(
			`flamefront route ${location} render must be 'ssr', 'ssg', or 'spa'.`,
		);
	}
	if (routeDefinition.hydration !== undefined && !hydrationModes.has(routeDefinition.hydration)) {
		throw new TypeError(
			`flamefront route ${location} hydration must be 'full', 'deferred', or 'none'.`,
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
	validateRoute(definition, '1');
	return Object.freeze(definition);
}

/** Group routes beneath a shared pathless layout without adding a URL segment. */
export function layout<const Children extends readonly RouteConfig[]>(
	entry: string,
	children: Children,
): LayoutDefinition<Children> {
	assertString(entry, 'layout entry');
	if (!Array.isArray(children)) {
		throw new TypeError('flamefront layout children must be an array.');
	}
	return Object.freeze({
		kind: 'layout' as const,
		entry,
		children: Object.freeze([...children]) as unknown as Children,
	});
}

function isLayoutDefinition(config: RouteConfig): config is LayoutDefinition {
	return 'kind' in config && config.kind === 'layout';
}

function normalizeRouteTree(
	configs: readonly RouteConfig[],
	seenPaths: Set<string>,
	location = '',
): { tree: readonly RouteConfig[]; routes: readonly RouteDefinition[] } {
	const routes: RouteDefinition[] = [];
	const tree = configs.map((config, index): RouteConfig => {
		const configLocation = location ? `${location}.${index + 1}` : `${index + 1}`;
		if (!config || typeof config !== 'object') {
			throw new TypeError(`flamefront route ${configLocation} must be an object.`);
		}

		if (isLayoutDefinition(config)) {
			assertString(config.entry, `layout ${configLocation} entry`);
			if (!Array.isArray(config.children)) {
				throw new TypeError(`flamefront layout ${configLocation} children must be an array.`);
			}
			const normalized = normalizeRouteTree(config.children, seenPaths, configLocation);
			routes.push(...normalized.routes);
			return Object.freeze({
				kind: 'layout' as const,
				entry: config.entry,
				children: normalized.tree,
			});
		}

		validateRoute(config, configLocation);
		if (seenPaths.has(config.path)) {
			throw new TypeError(`flamefront route path is duplicated: ${config.path}`);
		}
		seenPaths.add(config.path);
		const normalizedRoute = Object.freeze({ ...config });
		routes.push(normalizedRoute);
		return normalizedRoute;
	});

	return { tree: Object.freeze(tree), routes: Object.freeze(routes) };
}

function createRouteMatcher<T extends RouteDefinition>(
	routes: readonly T[],
	render?: RenderMode,
): MultiMatcher<T> {
	const matcher = createMultiMatcher<T>();
	for (const routeDefinition of routes) {
		if (render === undefined || routeDefinition.render === render) {
			matcher.add(routeDefinition.path, routeDefinition);
		}
	}
	return matcher;
}

function matchRoutes<T extends RouteDefinition>(
	routes: readonly T[],
	url: string | URL,
	options: MatchRouteOptions = {},
): Match<string, T> | null {
	let matchers = matcherCache.get(routes);
	if (!matchers) {
		matchers = new Map();
		matcherCache.set(routes, matchers);
	}

	let matcher = matchers.get(options.render) as MultiMatcher<T> | undefined;
	if (!matcher) {
		matcher = createRouteMatcher(routes, options.render);
		matchers.set(options.render, matcher as MultiMatcher<RouteDefinition>);
	}

	const normalizedUrl = new URL(url, 'http://flamefront.local');
	if (normalizedUrl.pathname.length > 1) {
		normalizedUrl.pathname = normalizedUrl.pathname.replace(/\/+$/, '');
	}

	return matcher.match(normalizedUrl);
}

/** Normalize and validate the application's explicit route graph. */
export function defineApp<const T extends { readonly routes: readonly RouteConfig[] }>(
	options: T,
): Omit<T, 'routes'> & AppDefinition {
	if (!options || !Array.isArray(options.routes)) {
		throw new TypeError('flamefront defineApp() requires a routes array.');
	}

	const normalized = normalizeRouteTree(options.routes, new Set());
	const frozenRoutes = normalized.routes;
	const load = createRouteDataLoader();
	const app = Object.freeze({
		...options,
		routes: frozenRoutes,
		routeTree: normalized.tree,
		match: (url: string | URL, matchOptions?: MatchRouteOptions) =>
			matchRoutes(frozenRoutes, url, matchOptions),
		load,
		prefetch: async (url: string | URL, loadOptions?: LoadRouteOptions) => {
			await load(url, loadOptions);
		},
	}) as Omit<T, 'routes'> & AppDefinition;
	matcherCache.set(
		frozenRoutes,
		new Map([[undefined, createRouteMatcher(frozenRoutes)]]) as Map<
			RenderMode | undefined,
			MultiMatcher<RouteDefinition>
		>,
	);
	return app;
}
