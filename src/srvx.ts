import type { ServerMiddleware, ServerOptions } from 'srvx';
import type { AppDefinition, RouteDefinition } from './index.ts';
import type { OctaneDocuments } from './octane.ts';
import type { DocumentMode, RenderedDocument } from './server.ts';

export type SrvxMiddleware = ServerMiddleware;

export interface TemplateContext<Route extends RouteDefinition = RouteDefinition> {
	readonly request: Request;
	readonly route: Route | null;
	readonly mode: DocumentMode;
}

export type TemplateLoader<Route extends RouteDefinition = RouteDefinition> = (
	context: TemplateContext<Route>,
) => string | Promise<string>;

export interface ServerAssets<Route extends RouteDefinition = RouteDefinition> {
	readonly clientDirectory: string | URL;
	readonly loadTemplate?: TemplateLoader<Route>;
}

export interface ResponseHeadersContext<
	Route extends RouteDefinition = RouteDefinition,
> {
	readonly request: Request;
	readonly route: Route | null;
	readonly mode: DocumentMode;
	readonly document: RenderedDocument;
}

export type ResponseHeaders = HeadersInit;

export type ResponseHeadersHook<Route extends RouteDefinition = RouteDefinition> = (
	context: ResponseHeadersContext<Route>,
) => ResponseHeaders | Promise<ResponseHeaders>;

export interface ServerEntryLifecycle {
	readonly renderDocument: OctaneDocuments['renderDocument'];
	readonly loadRouteData: OctaneDocuments['loadRouteData'];
}

export type FlamefrontServerEntry = ServerOptions & ServerEntryLifecycle;

export interface SrvxServerEntryOptions<
	Route extends RouteDefinition = RouteDefinition,
> {
	readonly app: AppDefinition<Route>;
	readonly documents: Pick<OctaneDocuments, 'renderDocument' | 'loadRouteData'>;
	readonly assets: ServerAssets<Route>;
	readonly middleware?: readonly SrvxMiddleware[];
	readonly headers?: ResponseHeadersHook<Route>;
}
