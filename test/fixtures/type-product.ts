import type { LoaderArgs } from "../../src/server.ts"

export async function loader({ params }: LoaderArgs<"/products/:productId">) {
  return { productId: params.productId }
}

export default function Product() {
  return null
}
