import type { ProductRecord } from "./product.ts"

const source = "catalog-loaded-from-server-only-module"

const products: Readonly<Record<string, ProductRecord>> = {
  octane: {
    id: "octane",
    name: "Octane field notes",
    description:
      "A compact guide to compiled components, loaders, and hydration.",
    price: "$18",
  },
  flamefront: {
    id: "flamefront",
    name: "Flamefront route map",
    description:
      "A printed route graph with server, static, and client annotations.",
    price: "$12",
  },
}

export function loadProduct(productId: string): {
  product: ProductRecord | undefined
  source: string
} {
  return { product: products[productId], source }
}
