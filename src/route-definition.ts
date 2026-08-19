import type { HydrationMode, RenderMode } from './index.ts';

export interface NormalizedRouteOptions {
	path: string;
	render: RenderMode;
	hydration?: HydrationMode;
}

const renderModes: ReadonlySet<string> = new Set(['ssr', 'ssg', 'spa']);
const hydrationModes: ReadonlySet<string> = new Set(['full', 'deferred', 'none']);
const optionKeys = new Set(['path', 'render', 'hydration']);

function assertString(value: unknown, name: string): asserts value is string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`flamefront ${name} must be a non-empty string.`);
	}
}

export function normalizeRouteOptions(options: unknown): NormalizedRouteOptions {
	if (!options || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('flamefront route options must be an object.');
	}
	const values = options as Record<string, unknown>;

	for (const key of Object.keys(values)) {
		if (!optionKeys.has(key)) {
			throw new TypeError(`flamefront route option is not supported: ${key}`);
		}
	}

	assertString(values.path, 'route path');
	if (!values.path.startsWith('/')) {
		throw new TypeError("flamefront route path must start with '/'.");
	}

	const render = values.render ?? 'ssr';
	if (typeof render !== 'string' || !renderModes.has(render)) {
		throw new TypeError("flamefront route render must be 'ssr', 'ssg', or 'spa'.");
	}
	const hydration = values.hydration;
	if (
		hydration !== undefined &&
		(typeof hydration !== 'string' || !hydrationModes.has(hydration))
	) {
		throw new TypeError(
			"flamefront route hydration must be 'full', 'deferred', or 'none'.",
		);
	}

	return {
		path: values.path,
		render: render as RenderMode,
		...(hydration === undefined ? null : { hydration: hydration as HydrationMode }),
	};
}
