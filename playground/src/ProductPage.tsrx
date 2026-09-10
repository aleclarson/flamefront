import { useLoaderData, useLocation } from "@octanejs/remix-router"
import type { LoaderArgs } from "flamefront/server"
import { useState } from "octane"
import { loadProduct } from "./product-data.server.ts"
import type { ProductRecord } from "./product.ts"
import { RouteFacts } from "./RouteFacts.tsrx"

type ProductLoaderData = {
  message: string;
  product: ProductRecord;
  source: string;
}

export async function loader({ params }: LoaderArgs): Promise<
  ProductLoaderData
> {
  const productId = params.productId ?? ""
  const result = loadProduct(productId)
  if (!result.product) {
    throw new Response("Product not found", { status: 404 })
  }
  return {
    message: `Server loader matched productId=${JSON.stringify(productId)}.`,
    product: result.product,
    source: result.source,
  }
}

export function ProductPage() @{
  const location = useLocation()
  const loaderData = useLoaderData<ProductLoaderData>()
  const [quantity, setQuantity] = useState(0)

  <main class="page" data-route={location.pathname} data-render-mode="server">
    <section class="content">
      <p class="eyebrow">Generated interaction hydration</p>
      <h1>{loaderData.product.name}</h1>
      <p>{loaderData.product.description}</p>
      <p class="price">{loaderData.product.price}</p>
      <RouteFacts pathname={location.pathname} loader={loaderData.message} />
      <div class="demo-action" data-testid="product-panel">
        <p data-testid="product-source">Data source: {loaderData.source}</p>
        <p data-testid="product-quantity">Quantity: {quantity}</p>
        <button
          data-testid="product-button"
          onClick={() => setQuantity(quantity + 1)}
        >
          Add one
        </button>
      </div>
    </section>
  </main>
}

export default ProductPage
