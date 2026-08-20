import {
	createMultiMatcher,
	type Match,
	type MultiMatcher,
} from '@remix-run/route-pattern/match';
import type { HydrationInteractionEvents } from 'octane/hydration';

export type RenderMode = 'client' | 'server' | 'static';
export interface IdleHydration {
	readonly when: 'idle';
	readonly timeout?: number;
}

export interface VisibleHydration {
	readonly when: 'visible';
	readonly rootMargin?: string;
	readonly threshold?: number | readonly number[];
}

export interface InteractionHydration {
	readonly when: 'interaction';
	readonly events?: HydrationInteractionEvents;
}

export interface MediaHydration {
	readonly when: 'media';
	readonly query: string;
}

export type GeneratedHydration =
	| IdleHydration
	| VisibleHydration
	| InteractionHydration
	| MediaHydration;

/**
 * `full` hydrates with the shell, `deferred` leaves boundaries to the route,
 * `none` keeps server HTML inert, and an object generates one route boundary.
 */
export type HydrationMode = 'full' | 'deferred' | 'none' | GeneratedHydration;

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
	/** Octane/Vite project-root module ID for the persistent app shell. */
	readonly shell: string;
	readonly routes: readonly T[];
	readonly routeTree: readonly RouteConfig[];
	readonly match: (url: string | URL, options?: MatchRouteOptions) => Match<string, T> | null;
	readonly load: <Data = unknown>(url: string | URL, options?: LoadRouteOptions) => Promise<Data>;
	readonly prefetch: (url: string | URL, options?: LoadRouteOptions) => Promise<void>;
}

const renderModes: ReadonlySet<unknown> = new Set<RenderMode>([
	'client',
	'server',
	'static',
]);
const hydrationModes: ReadonlySet<unknown> = new Set([
	'full',
	'deferred',
	'none',
]);
const interactionEvents: ReadonlySet<string> = new Set([
	'auxclick',
	'beforeinput',
	'click',
	'compositionend',
	'compositionstart',
	'compositionupdate',
	'contextmenu',
	'dblclick',
	'focusin',
	'input',
	'keydown',
	'keyup',
	'mousedown',
	'mouseenter',
	'mouseover',
	'mouseup',
	'pointerdown',
	'pointerenter',
	'pointerover',
	'pointerup',
	'touchend',
	'touchstart',
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

function assertOnlyKeys(
	value: Record<string, unknown>,
	keys: readonly string[],
	location: string,
): void {
	const allowed = new Set(keys);
	const unexpected = Object.keys(value).find((key) => !allowed.has(key));
	if (unexpected) {
		throw new TypeError(
			`flamefront route ${location} hydration has an unexpected ${JSON.stringify(unexpected)} option.`,
		);
	}
}

function assertThreshold(value: unknown, location: string): void {
	const thresholds = Array.isArray(value) ? value : [value];
	if (
		thresholds.length === 0 ||
		thresholds.some(
			(threshold) =>
				typeof threshold !== 'number' ||
				!Number.isFinite(threshold) ||
				threshold < 0 ||
				threshold > 1,
		)
	) {
		throw new TypeError(
			`flamefront route ${location} hydration threshold must contain numbers from 0 through 1.`,
		);
	}
}

function validateGeneratedHydration(
	hydration: Record<string, unknown>,
	location: string,
): void {
	switch (hydration.when) {
		case 'idle':
			assertOnlyKeys(hydration, ['when', 'timeout'], location);
			if (
				hydration.timeout !== undefined &&
				(typeof hydration.timeout !== 'number' ||
					!Number.isFinite(hydration.timeout) ||
					hydration.timeout < 0)
			) {
				throw new TypeError(
					`flamefront route ${location} hydration timeout must be a non-negative number.`,
				);
			}
			return;
		case 'visible':
			assertOnlyKeys(hydration, ['when', 'rootMargin', 'threshold'], location);
			if (hydration.rootMargin !== undefined) {
				assertString(hydration.rootMargin, `route ${location} hydration rootMargin`);
			}
			if (hydration.threshold !== undefined) {
				assertThreshold(hydration.threshold, location);
			}
			return;
		case 'interaction': {
			assertOnlyKeys(hydration, ['when', 'events'], location);
			if (hydration.events === undefined) return;
			const events = Array.isArray(hydration.events)
				? hydration.events
				: [hydration.events];
			if (
				events.length === 0 ||
				events.some((event) => typeof event !== 'string' || !interactionEvents.has(event))
			) {
				throw new TypeError(
					`flamefront route ${location} hydration events must be supported Octane interaction events.`,
				);
			}
			return;
		}
		case 'media':
			assertOnlyKeys(hydration, ['when', 'query'], location);
			assertString(hydration.query, `route ${location} hydration query`);
			return;
		default:
			throw new TypeError(
				`flamefront route ${location} hydration trigger must be 'idle', 'visible', 'interaction', or 'media'.`,
			);
	}
}

function validateHydration(routeDefinition: RouteDefinition, location: string): void {
	const { hydration, render } = routeDefinition;
	if (hydration === undefined) return;

	if (typeof hydration === 'object' && hydration !== null && !Array.isArray(hydration)) {
		validateGeneratedHydration(hydration as unknown as Record<string, unknown>, location);
		if (render !== 'server' && render !== 'static') {
			throw new TypeError(
				`flamefront route ${location} generated hydration requires render: 'server' or 'static'.`,
			);
		}
		return;
	}

	if (!hydrationModes.has(hydration)) {
		throw new TypeError(
			`flamefront route ${location} hydration must be 'full', 'deferred', 'none', or a trigger object.`,
		);
	}
	if (render === 'client' && hydration !== 'full') {
		throw new TypeError(
			`flamefront route ${location} client hydration can only be 'full'.`,
		);
	}
}

function freezeHydration(hydration: HydrationMode | undefined): HydrationMode | undefined {
	if (typeof hydration !== 'object' || hydration === null) return hydration;
	if (hydration.when === 'visible' && Array.isArray(hydration.threshold)) {
		return Object.freeze({
			...hydration,
			threshold: Object.freeze([...hydration.threshold]),
		});
	}
	if (hydration.when === 'interaction' && Array.isArray(hydration.events)) {
		return Object.freeze({
			...hydration,
			events: Object.freeze([...hydration.events]),
		});
	}
	return Object.freeze({ ...hydration });
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
			`flamefront route ${location} render must be 'client', 'server', or 'static'.`,
		);
	}
	validateHydration(routeDefinition, location);
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
		hydration: freezeHydration(options.hydration),
		render: options.render ?? 'server',
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
		const normalizedRoute = Object.freeze({
			...config,
			hydration: freezeHydration(config.hydration),
		});
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
export function defineApp<const T extends {
	readonly shell: string;
	readonly routes: readonly RouteConfig[];
}>(
	options: T,
): Omit<T, 'routes'> & AppDefinition {
	if (!options || typeof options !== 'object' || !Array.isArray(options.routes)) {
		throw new TypeError('flamefront defineApp() requires a routes array.');
	}
	assertString(options.shell, 'app shell entry');

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
