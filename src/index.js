import { normalizeRouteOptions } from './route-definition.js';

/**
 * Associate static route metadata with an Octane component.
 *
 * Flamefront's Vite plugin extracts and erases top-level calls at compile time.
 * The small runtime implementation keeps untransformed modules predictable.
 *
 * @template {Function} T
 * @param {T} component
 * @param {Record<string, unknown>} options
 * @returns {T}
 */
export function defineRoute(component, options) {
	if (typeof component !== 'function') {
		throw new TypeError('flamefront defineRoute() requires a component function.');
	}
	normalizeRouteOptions(options);
	return component;
}
