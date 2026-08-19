const renderModes = new Set(['ssr', 'ssg', 'spa']);
const hydrationModes = new Set(['full', 'deferred', 'none']);
const optionKeys = new Set(['path', 'render', 'hydration']);

function assertString(value, name) {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`flamefront ${name} must be a non-empty string.`);
	}
}

/**
 * Validate and normalize the statically serializable route options.
 *
 * @param {Record<string, unknown>} options
 */
export function normalizeRouteOptions(options) {
	if (!options || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('flamefront route options must be an object.');
	}

	for (const key of Object.keys(options)) {
		if (!optionKeys.has(key)) {
			throw new TypeError(`flamefront route option is not supported: ${key}`);
		}
	}

	assertString(options.path, 'route path');
	if (!options.path.startsWith('/')) {
		throw new TypeError("flamefront route path must start with '/'.");
	}

	const render = options.render ?? 'ssr';
	if (!renderModes.has(render)) {
		throw new TypeError("flamefront route render must be 'ssr', 'ssg', or 'spa'.");
	}
	if (options.hydration !== undefined && !hydrationModes.has(options.hydration)) {
		throw new TypeError(
			"flamefront route hydration must be 'full', 'deferred', or 'none'.",
		);
	}

	return {
		path: options.path,
		render,
		...(options.hydration === undefined ? null : { hydration: options.hydration }),
	};
}
