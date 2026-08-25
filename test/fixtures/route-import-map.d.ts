declare module "flamefront" {
  interface RouteImportMap {
    "/": typeof import("./type-home.ts")
    "/products/:productId": typeof import("./type-product.ts")
  }
}

export {}
