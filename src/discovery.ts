import { readFile, readdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
// @ts-expect-error @tsrx/core does not publish a declaration for its parser entrypoint.
import { parseModule } from '@tsrx/core';
import type { RouteDefinition } from './index.ts';
import { normalizeRouteOptions } from './route-definition.ts';

export const FLAMEFRONT_CONFIG_FILE = 'flamefront.config.json' as const;

export interface FlamefrontConfig {
	configPath: string;
	routes: { include: string[] };
}

export interface RouteProject {
	configPath: string;
	sourceFiles: string[];
	routes: RouteDefinition[];
}

export interface ExtractedRouteModule {
	code: string;
	routes: RouteDefinition[];
}

type AstNode = Record<string, any>;

function toPosixPath(value: string): string {
	return value.split(sep).join('/');
}

function globToRegExp(pattern: string): RegExp {
	let expression = '^';
	for (let index = 0; index < pattern.length; index += 1) {
		const character = pattern[index];
		if (character === '*') {
			if (pattern[index + 1] === '*') {
				index += 1;
				if (pattern[index + 1] === '/') {
					index += 1;
					expression += '(?:.*/)?';
				} else {
					expression += '.*';
				}
			} else {
				expression += '[^/]*';
			}
			continue;
		}
		if (character === '?') {
			expression += '[^/]';
			continue;
		}
		expression += /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
	}
	return new RegExp(`${expression}$`);
}

function staticPatternRoot(pattern: string): string {
	const wildcard = pattern.search(/[?*]/);
	if (wildcard === -1) return pattern;
	const slash = pattern.lastIndexOf('/', wildcard);
	return slash === -1 ? '.' : pattern.slice(0, slash) || '.';
}

async function walkFiles(directory: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await readdir(directory, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walkFiles(path)));
		else if (entry.isFile()) files.push(path);
	}
	return files;
}

async function filesForPattern(root: string, pattern: string): Promise<string[]> {
	const normalizedPattern = toPosixPath(pattern).replace(/^\.\//, '');
	const matcher = globToRegExp(normalizedPattern);
	const base = resolve(root, staticPatternRoot(normalizedPattern));
	let baseStat;
	try {
		baseStat = await stat(base);
	} catch (error) {
		if (hasErrorCode(error, 'ENOENT')) return [];
		throw error;
	}
	const candidates = baseStat.isDirectory() ? await walkFiles(base) : [base];
	return candidates.filter((file) => matcher.test(toPosixPath(relative(root, file))));
}

function propertyName(property: AstNode): string | null {
	if (property.computed) return null;
	if (property.key?.type === 'Identifier') return property.key.name;
	if (property.key?.type === 'Literal' && typeof property.key.value === 'string') {
		return property.key.value;
	}
	return null;
}

function staticRouteOptions(node: AstNode, file: string) {
	if (node?.type !== 'ObjectExpression') {
		throw new TypeError(`${file}: defineRoute() options must be an object literal.`);
	}
	const options: Record<string, unknown> = {};
	for (const property of node.properties ?? []) {
		if (property.type !== 'Property' || property.kind !== 'init' || property.method) {
			throw new TypeError(`${file}: defineRoute() options must contain plain properties.`);
		}
		const key = propertyName(property);
		if (key === null) {
			throw new TypeError(`${file}: defineRoute() option names must be static.`);
		}
		if (property.value?.type !== 'Literal' || typeof property.value.value !== 'string') {
			throw new TypeError(`${file}: defineRoute() option ${key} must be a string literal.`);
		}
		options[key] = property.value.value;
	}
	try {
		return normalizeRouteOptions(options);
	} catch (error) {
		throw new TypeError(`${file}: ${errorMessage(error)}`, { cause: error });
	}
}

function exportedBindings(program: AstNode): Map<string, string> {
	const bindings = new Map<string, string>();
	for (const node of program.body ?? []) {
		if (node.type === 'ExportDefaultDeclaration') {
			const local = node.declaration?.id?.name ?? node.declaration?.name;
			if (local) bindings.set(local, 'default');
			continue;
		}
		if (node.type !== 'ExportNamedDeclaration') continue;
		const declaration = node.declaration;
		if (declaration?.id?.name) bindings.set(declaration.id.name, declaration.id.name);
		if (declaration?.type === 'VariableDeclaration') {
			for (const item of declaration.declarations ?? []) {
				if (item.id?.type === 'Identifier') bindings.set(item.id.name, item.id.name);
			}
		}
		if (node.source !== null) continue;
		for (const specifier of node.specifiers ?? []) {
			const local = specifier.local?.name ?? specifier.local?.value;
			const exported = specifier.exported?.name ?? specifier.exported?.value;
			if (local && exported) bindings.set(local, exported);
		}
	}
	return bindings;
}

function blankRanges(source: string, ranges: Array<[number, number]>): string {
	let output = source;
	for (const [start, end] of ranges.sort((left, right) => right[0] - left[0])) {
		const blank = source.slice(start, end).replace(/[^\r\n]/g, ' ');
		output = output.slice(0, start) + blank + output.slice(end);
	}
	return output;
}

export function extractRouteModule(
	source: string,
	file: string,
	root = process.cwd(),
): ExtractedRouteModule {
	if (!source.includes('flamefront') || !source.includes('defineRoute')) {
		return { code: source, routes: [] };
	}

	const program = parseModule(source, file) as AstNode;
	const routeBindings = new Set<string>();
	for (const node of program.body ?? []) {
		if (node.type !== 'ImportDeclaration' || node.source?.value !== 'flamefront') continue;
		for (const specifier of node.specifiers ?? []) {
			if (
				specifier.type === 'ImportSpecifier' &&
				(specifier.imported?.name ?? specifier.imported?.value) === 'defineRoute'
			) {
				routeBindings.add(specifier.local.name);
			}
		}
	}
	if (routeBindings.size === 0) return { code: source, routes: [] };

	const exports = exportedBindings(program);
	const entry = `/${toPosixPath(relative(root, file))}`;
	const ranges: Array<[number, number]> = [];
	const routes: RouteDefinition[] = [];
	for (const node of program.body ?? []) {
		const call = node.type === 'ExpressionStatement' ? node.expression : null;
		if (
			call?.type !== 'CallExpression' ||
			call.callee?.type !== 'Identifier' ||
			!routeBindings.has(call.callee.name)
		) {
			continue;
		}
		if (call.arguments?.length !== 2 || call.arguments[0]?.type !== 'Identifier') {
			throw new TypeError(`${file}: defineRoute() requires a component and static options.`);
		}
		const localComponent = call.arguments[0].name;
		const component = exports.get(localComponent);
		if (!component) {
			throw new TypeError(
				`${file}: defineRoute() component ${localComponent} must be exported from its module.`,
			);
		}
		const options = staticRouteOptions(call.arguments[1], file);
		routes.push({
			path: options.path,
			entry,
			component,
			render: options.render,
			...(options.hydration === undefined ? null : { hydration: options.hydration }),
		});
		ranges.push([node.start, node.end]);
	}
	return { code: blankRanges(source, ranges), routes };
}

function hasErrorCode(error: unknown, code: string): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === code
	);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function loadFlamefrontConfig(root = process.cwd()): Promise<FlamefrontConfig> {
	const configPath = resolve(root, FLAMEFRONT_CONFIG_FILE);
	let source;
	try {
		source = await readFile(configPath, 'utf8');
	} catch (error) {
		if (hasErrorCode(error, 'ENOENT')) throw new Error(`Could not find ${configPath}.`);
		throw error;
	}
	let config: unknown;
	try {
		config = JSON.parse(source);
	} catch (error) {
		throw new Error(`${configPath} is not valid JSON.`, { cause: error });
	}
	const routesConfig = isRecord(config) && isRecord(config.routes) ? config.routes : null;
	const include = routesConfig?.include;
	if (
		!Array.isArray(include) ||
		include.length === 0 ||
		include.some((item) => typeof item !== 'string')
	) {
		throw new TypeError(`${configPath} must define routes.include as a non-empty string array.`);
	}
	return { configPath, routes: { include } };
}

export async function discoverRouteProject(root = process.cwd()): Promise<RouteProject> {
	const config = await loadFlamefrontConfig(root);
	const sourceFiles = [
		...new Set(
			(
				await Promise.all(config.routes.include.map((pattern) => filesForPattern(root, pattern)))
			).flat(),
		),
	].sort();
	const routes: RouteDefinition[] = [];
	for (const file of sourceFiles) {
		const source = await readFile(file, 'utf8');
		routes.push(...extractRouteModule(source, file, root).routes);
	}
	const seenPaths = new Map<string, string>();
	for (const route of routes) {
		const previous = seenPaths.get(route.path);
		if (previous) {
			throw new TypeError(
				`flamefront route path is duplicated: ${route.path} (${previous} and ${route.entry})`,
			);
		}
		seenPaths.set(route.path, route.entry);
	}
	return { configPath: config.configPath, sourceFiles, routes };
}

export async function discoverRoutes(root = process.cwd()): Promise<RouteDefinition[]> {
	return (await discoverRouteProject(root)).routes;
}
