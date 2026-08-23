import { RouterProvider } from "@octanejs/remix-router/dom"
import type { RouterDocument as RouterDocumentComponent } from "./octane.ts"

/** Canonical router root shared by Flamefront's Octane server and client. */
export const RouterDocument = RouterProvider as RouterDocumentComponent
