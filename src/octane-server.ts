import { importRoute as generatedImportRoute } from 'virtual:flamefront/server-routes';
import type { ServerOptions } from 'srvx';
import type { AppDefinition } from './index.ts';
import {
	createOctaneDocuments,
	type RouterDocument,
} from './octane.ts';
import {
	createRouteRuntime,
	type RenderedDocument,
	type RouteModule,
} from './server.ts';
import { createSrvxServer } from './server.ts';

export type { RouterDocument } from './octane.ts';

export interface OctaneServerOptions {
	readonly app: AppDefinition;
	readonly clientDirectory: string | URL;
	readonly routerDocument?: RouterDocument;
	readonly importRoute?: (entry: string) => Promise<RouteModule>;
}

export interface OctaneServerEntry {
	readonly server: ServerOptions;
	readonly loadRouteData: (request: Request) => Promise<Response>;
	readonly renderSsrDocument: (template: string, request: Request) => Promise<string>;
	readonly renderSsgDocument: (
		template: string,
		request: Request,
	) => Promise<RenderedDocument>;
}

/**
 * Temporary wrapper for the pre-composition lifecycle. Commit 2 removes this
 * old entry contract after the lifecycle consumes the new default object.
 */
export function createOctaneServer(options: OctaneServerOptions): OctaneServerEntry {
	const importRoute = options.importRoute ?? generatedImportRoute;
	const runtime = createRouteRuntime({
		app: options.app,
		importRoute,
	});
	const documents = createOctaneDocuments({
		app: options.app,
		runtime,
		routerDocument: options.routerDocument,
	});
	const renderSsrDocument = async (template: string, request: Request): Promise<string> =>
		(await documents.renderDocument(template, request)).html;
	const renderSsgDocument = (template: string, request: Request): Promise<RenderedDocument> =>
		documents.renderDocument(template, request, { mode: 'static' });

	return {
		server: createSrvxServer({
			app: options.app,
			clientDirectory: options.clientDirectory,
			loadRouteData: documents.loadRouteData,
			renderSsrDocument,
			renderSsgDocument,
		}),
		loadRouteData: documents.loadRouteData,
		renderSsrDocument,
		renderSsgDocument,
	};
}
