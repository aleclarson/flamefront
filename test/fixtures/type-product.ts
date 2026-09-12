import type { ActionArgs, LoaderArgs } from "../../src/server.ts"

export async function loader({ params }: LoaderArgs<"/products/:productId">) {
  return { productId: params.productId }
}

export async function action({ params }: ActionArgs<"/products/:productId">) {
  return { productId: params.productId, saved: true }
}

export default function Product() {
  return null
}
