import type { RouteDefinition } from './index.js';

export const FLAMEFRONT_CONFIG_FILE: 'flamefront.config.json';

export interface FlamefrontConfig {
	configPath: string;
	routes: { include: string[] };
}

export interface RouteProject {
	configPath: string;
	sourceFiles: string[];
	routes: RouteDefinition[];
}

export function extractRouteModule(
	source: string,
	file: string,
	root?: string,
): { code: string; routes: RouteDefinition[] };
export function loadFlamefrontConfig(root?: string): Promise<FlamefrontConfig>;
export function discoverRouteProject(root?: string): Promise<RouteProject>;
export function discoverRoutes(root?: string): Promise<RouteDefinition[]>;
