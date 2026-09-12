import { href } from "@octanejs/remix-router"
import { importRoute as generatedImportRoute } from "virtual:flamefront/server-routes"
import {
  clientRoute,
  defineApp,
  layout,
  route,
  routeHref,
  serverRoute,
  staticRoute,
  type BroadRouteParams,
  type RouteActionData,
  type RouteActionFor,
  type RouteLoaderData,
  type RouteParams,
} from "../src/index.ts"
import { createRouteRuntime, loadRoute } from "../src/server.ts"
import { createRouteDataClient } from "../src/route-data-client.ts"
import { loadRouteData, loadStaticRouteData } from "../src/remix-route-data.ts"
import type { LoaderArgs } from "../src/server.ts"
import type { RouteImporterFor } from "../src/server.ts"

const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [
    route("/", "/src/Home.tsrx"),
    route("/products/:productId", "/src/Product.tsrx"),
  ],
})

defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [
    serverRoute("/server", "/src/Server.tsrx", { hydration: "deferred" }),
    staticRoute("/static", "/src/Static.tsrx", { hydration: "none" }),
    clientRoute("/client", "/src/Client.tsrx"),
  ],
})

// @ts-expect-error A render-mode shorthand does not accept a render option.
serverRoute("/wrong-mode", "/src/WrongMode.tsrx", { render: "client" })

const productMatch = app.match("/products/octane")

if (productMatch) {
  const productId: string = productMatch.params.productId

  void productId
}

const rootMatch = app.match("/")

if (rootMatch) {
  // @ts-expect-error The root route has no productId parameter.
  void rootMatch.params.productId
}

const productData: Promise<{ productId: string }> = app.load("/products/octane")

void productData
const trailingProductData: Promise<{ productId: string }> =
  app.load("/products/octane/")
const trailingProductMatch = app.match("/products/octane/")

if (trailingProductMatch) {
  const trailingProductId: string = trailingProductMatch.params.productId

  void trailingProductId
}

void trailingProductData
const explicitData: Promise<{ value: number }> = app.load<{ value: number }>(
  "/unknown",
)

void explicitData
const unknownLiteralData: Promise<unknown> = app.load("/unknown")
// @ts-expect-error An unmatched literal URL has no generated loader result.
const notUnknownLiteralData: Promise<{ productId: string }> =
  app.load("/unknown")

void unknownLiteralData
void notUnknownLiteralData

declare const arbitraryPath: string
const arbitraryData: Promise<unknown> = app.load(arbitraryPath)
const arbitraryMatch = app.match(arbitraryPath)

if (arbitraryMatch) {
  const arbitraryParams: BroadRouteParams = arbitraryMatch.params

  void arbitraryParams
}

// @ts-expect-error Arbitrary URLs do not promise a generated loader result.
const notArbitraryProductData: Promise<{ productId: string }> =
  app.load(arbitraryPath)

void arbitraryData
void notArbitraryProductData

const routeDataClient = createRouteDataClient()
const clientProductData: Promise<{ productId: string }> = routeDataClient.load(
  "/products/octane",
  "live",
)

void clientProductData
const arbitraryClientData: Promise<unknown> = routeDataClient.load(
  arbitraryPath,
  "live",
)

void arbitraryClientData

declare const routeRequest: Request
const generatedLoaderData: Promise<{ productId: string }> =
  loadRouteData<"/products/:productId">({ request: routeRequest })
const generatedStaticData: Promise<{ productId: string }> =
  loadStaticRouteData<"/products/:productId">({ request: routeRequest })

void generatedLoaderData
void generatedStaticData

const generatedHref: string = href("/products/:productId", {
  productId: "octane",
})
const rootHref: string = href("/")

// @ts-expect-error The generated href requires productId.
href("/products/:productId")
const authoredHref: string = routeHref("/products/:productId", {
  productId: "octane",
})

void generatedHref
void rootHref
void authoredHref

// @ts-expect-error Required route parameters must be provided.
routeHref("/products/:productId")

const nestedApp = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [
    layout("/src/ProductsLayout.tsrx", [
      route("/products/:productId", "/src/Product.tsrx"),
    ]),
  ],
})
const nestedProductMatch = nestedApp.match("/products/octane")

if (nestedProductMatch) {
  const nestedProductId: string = nestedProductMatch.params.productId

  void nestedProductId
}

type ProductParams = RouteParams<"/products/:productId">
type ProductData = RouteLoaderData<"/products/:productId">
type ProductAction = RouteActionFor<"/products/:productId">
type ProductActionData = RouteActionData<"/products/:productId">
const params: ProductParams = { productId: "octane" }
const data: ProductData = { productId: "octane" }

declare const productAction: ProductAction
const actionData: Promise<ProductActionData> = productAction({
  request: routeRequest,
  params: { productId: "octane" },
  context: undefined,
})

void params
void data
void actionData

declare const contextualLoaderArgs: LoaderArgs<
  "/products/:productId",
  { readonly tenant: string }
>
const contextualProductId: string = contextualLoaderArgs.params.productId
const contextualTenant: string = contextualLoaderArgs.context.tenant

void contextualProductId
void contextualTenant

const productApp = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [route("/products/:productId", "/src/Product.tsrx")],
})

type ProductRoute = (typeof productApp.routes)[number]
const typedImporter: RouteImporterFor<ProductRoute> = async (entry) => {
  void entry
  return import("./fixtures/type-product.ts")
}

const runtime = createRouteRuntime({
  app: productApp,
  importRoute: async () => import("./fixtures/type-product.ts"),
})
const typedRuntime = createRouteRuntime({
  app: productApp,
  importRoute: typedImporter,
})
const generatedRuntime = createRouteRuntime({
  app: productApp,
  importRoute: generatedImportRoute,
})

async function verifyServerImportTypes() {
  const loaded = await loadRoute(
    productApp,
    new Request("https://example.test/products/octane"),
    typedImporter,
  )

  if (loaded) {
    const productId: string = loaded.loaderData.productId

    void productId
  }
}

void verifyServerImportTypes

async function verifyRuntimeImportTypes() {
  const loaded = await runtime.loadRoute(
    new Request("https://example.test/products/octane"),
  )

  if (loaded) {
    const productId: string = loaded.loaderData.productId

    void productId
  }
}

void verifyRuntimeImportTypes

async function verifyTypedRuntimeImportTypes() {
  const loaded = await typedRuntime.loadRoute(
    new Request("https://example.test/products/octane"),
  )

  if (loaded) {
    const productId: string = loaded.loaderData.productId

    void productId
  }
}

void verifyTypedRuntimeImportTypes

async function verifyGeneratedRuntimeImportTypes() {
  const loaded = await generatedRuntime.loadRoute(
    new Request("https://example.test/products/octane"),
  )

  if (loaded) {
    const productId: string = loaded.loaderData.productId

    void productId
  }
}

void verifyGeneratedRuntimeImportTypes
