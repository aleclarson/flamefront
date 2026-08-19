const renderModes = new Set(['ssr', 'ssg', 'spa']);
const hydrationModes = new Set(['full', 'deferred', 'none']);

function assertString(value, name) {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`flamefront ${name} must be a non-empty string.`);
	}
}

function validateRoute(routeDefinition, index) {
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

/**
 * Define one explicit route without relying on a filesystem convention.
 *
 * @param {string} path
 * @param {string} entry
 * @param {Record<string, unknown>} [options]
 * @returns {Record<string, unknown> & { path: string, entry: string, render: string }}
 */
export function route(path, entry, options = {}) {
	const definition = {
		path,
		entry,
		...options,
		render: options.render ?? 'ssr',
	};
	validateRoute(definition, 0);
	return Object.freeze(definition);
}

/**
 * Normalize and validate the application's explicit route graph.
 *
 * @param {{ routes: readonly Record<string, unknown>[] } & Record<string, unknown>} options
 * @returns {{ routes: readonly Record<string, unknown>[] } & Record<string, unknown>}
 */
export function defineApp(options) {
	if (!options || !Array.isArray(options.routes)) {
		throw new TypeError('flamefront defineApp() requires a routes array.');
	}

	const seenPaths = new Set();
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
	});
}

/**
 * Select routes for one render mode.
 *
 * @param {{ routes: readonly { render: string }[] }} app
 * @param {'ssr' | 'ssg' | 'spa'} render
 */
export function routesFor(app, render) {
	return app.routes.filter((routeDefinition) => routeDefinition.render === render);
}
