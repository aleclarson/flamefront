# Forms and mutations

> Add a validated write, submit it with or without browser JavaScript, and
> verify that the page displays the saved value.

Flamefront has two ways to run a write on the server:

- A callable action lives in a `*.server.ts` module and can be imported by
  browser code. The browser import is a typed network proxy.
- A page module can export `action({ request, params, context })`. That
  function is the target for a form at the page URL. It reads the form body
  and chooses which callable actions to run.

The page action and the callable action have different jobs. Flamefront does
not guess how a form field maps to positional action arguments.

## Prepare the example

Start with the [one-page setup](create-app.md), keeping its server and browser
entries. Install the validator used below:

```sh
pnpm add zod
```

Create `src/product-store.server.ts`:

```ts
const products = new Map([["42", "Original name"]])

export const productStore = {
  get(productId: string) {
    const name = products.get(productId)
    if (name === undefined)
      throw new Response("Product not found", { status: 404 })
    return { id: productId, name }
  },
  async rename(productId: string, name: string) {
    this.get(productId)
    products.set(productId, name)
  },
}
```

This local demonstration stores data in one server process and resets it on
restart. Replace it with your application's persistence and authorization
before using it for real data.

Replace `src/app.ts` with:

```ts
import { defineApp, serverRoute } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [serverRoute("/products/:id", "/src/ProductPage.tsrx")],
})
```

## Declare a callable action

Put the write and its server-only dependencies in a `*.server.ts` file:

```ts
// src/products.server.ts
import { action } from "flamefront/server"
import { z } from "zod"
import { productStore } from "./product-store.server.ts"

export const renameProduct = action(
  [z.string(), z.string().min(1)],
  async (productId, newName) => {
    await productStore.rename(productId, newName)
    return { saved: true, error: null }
  },
)
```

The validator list is positional. Each validator follows the Standard Schema
contract, so another validation library can be used in its place. The action's
call signature uses each validator's input type, while the handler receives its
validated output type. Transforming validators are supported.

If no validator list is supplied, the handler receives `unknown[]`:

```ts
export const logCommand = action(async (...args) => {
  // Check and narrow every value before using it.
  return { received: args.length }
})
```

Arguments and results use `devalue`, so values such as dates, maps, and nested
objects can cross the action boundary. Validation runs on the server for every
call. Your action must also enforce the application's authorization policy.

## Add a page action for forms

A route module can export a page action alongside its default component and
loader. The page action reads native form data, maps it explicitly, and calls
the callable action without another HTTP hop on the server:

```ts
// src/ProductPage.tsrx
import { data } from "flamefront/server"
import type { ActionArgs, LoaderArgs } from "flamefront/server"
import { renameProduct } from "./products.server.ts"
import { productStore } from "./product-store.server.ts"
import { useActionData, useLoaderData } from "flamefront/remix-router"

export async function loader({ params }: LoaderArgs<"/products/:id">) {
  return productStore.get(params.id)
}

export async function action({ request, params }: ActionArgs<"/products/:id">) {
  const form = await request.formData()
  const name = form.get("name")

  if (typeof name !== "string" || name.trim() === "") {
    return data({ error: "Enter a product name." }, { status: 400 })
  }

  return renameProduct(params.id, name)
}
```

The page export is named `action`; the callable factory is imported from the
server entry and normally lives in a separate server module. A page action can
return a value, `data(value, init)` for status or headers, `redirect(url)`, or a
Fetch `Response`.

## Use a native form

The ordinary HTML form posts to the current page URL and works when JavaScript
is disabled.

Append this component to `src/ProductPage.tsrx`:

```tsx
export default function ProductPage() @{
  const product = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()

  <main>
    <h1>{product.name}</h1>
    <form method="post">
      <label>New name <input name="name" /></label>
      {actionData?.error ? <p>{actionData.error}</p> : null}
      <button type="submit">Save</button>
    </form>
  </main>
}
```

Run `pnpm exec ff dev` and visit `/products/42`. Disable JavaScript and reload
before submitting a new name. The returned document should show the saved
name in its heading. Submit an empty name to see the validation message.

For a server route, the server runs the page action and renders the document
again. A successful redirect is returned as an HTTP redirect, and `data()`
results are available as the router's action data. Static-only hosting cannot
execute an action; a static page must post to a server-backed route or
application-owned endpoint. Static routes do not own page actions.

## Enhance it with the router

Replace the native component with the version below and add `Form` and
`useNavigation` to the existing `flamefront/remix-router` import:

```tsx
export default function ProductPage() @{
  const product = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()

  <main>
    <h1>{product.name}</h1>
    <Form method="post">
      <label>New name <input name="name" /></label>
      {actionData?.error ? <p>{actionData.error}</p> : null}
      <button disabled={navigation.state === "submitting"}>
        {navigation.state === "submitting" ? "Saving…" : "Save"}
      </button>
    </Form>
  </main>
}
```

Re-enable JavaScript and reload. Submit another name: the heading updates
through loader revalidation. The button shows submitting state while the
request is pending; network throttling makes that brief state easier to check.
An empty submission still displays the validation message.

The generated route action sends the same encoded form request to the server.
The router exposes submitting state, action data, redirects, and errors, then
revalidates active loaders. The server action runs once; the subsequent loader
refresh is a read.

## Call an action directly

Browser code can import a callable action and call it without a form:

```ts
import { renameProduct } from "./products.server.ts"

const result = await renameProduct(productId, newName)
```

The import becomes a browser proxy during the Vite build. A normal result is
returned to the caller. Validation failures reject with an error containing the
server's issues; a redirect is delivered as a `Response` so the caller can
choose how to navigate. Successful calls invalidate live route data and server
fragments; the router's enhanced form path also revalidates active routes.

Keep authentication and authorization inside the callable or page action.
Flamefront checks browser mutation requests for same-origin metadata, but it
cannot decide who is allowed to perform a write.
