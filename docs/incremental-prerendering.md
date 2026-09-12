# Reuse static pages between builds

> Enumerate static pages, assign content keys, and verify that unchanged pages
> reuse cached content while every build produces a complete deployment.

Start with the [one-page app](create-app.md). Keep its shell, browser entry,
server entry, and HTML template. Run the commands below from that app's root.
This is build-time caching; deployed pages change only after another build
and deployment.

## Add content and a static route

Create a `content` directory and add `content/posts.json`:

```json
[
  { "slug": "hello", "title": "Hello", "body": "Our first post." },
  { "slug": "next", "title": "Next", "body": "Our second post." }
]
```

Replace `src/app.ts` with:

```ts
import { defineApp, staticRoute } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [staticRoute("/posts/:slug", "/src/PostPage.tsrx")],
})
```

Create `src/PostPage.tsrx`. Its loader reads the content at build time:

```tsx
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { useLoaderData } from "flamefront/remix-router"
import type { LoaderArgs } from "flamefront/server"

export async function loader({ params }: LoaderArgs<"/posts/:slug">) {
  const posts: { slug: string; title: string; body: string }[] = JSON.parse(
    await readFile(resolve(process.cwd(), "content/posts.json"), "utf8"),
  )
  const post = posts.find((post) => post.slug === params.slug)
  if (!post) throw new Response("Post not found", { status: 404 })
  return post
}

export default function PostPage() @{
  const post = useLoaderData<typeof loader>()

  <article>
    <h1>{post.title}</h1>
    <p>{post.body}</p>
  </article>
}
```

## Enumerate paths and content keys

Replace `vite.config.ts` with:

```ts
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { defineConfig } from "vite"
import { octane } from "@octanejs/vite-plugin"
import { flamefront } from "flamefront/vite"
import { hash } from "flamefront/prerender"

export default defineConfig({
  plugins: [
    flamefront({
      target: "node",
      prerender: {
        async pages({ root }) {
          const posts: { slug: string; title: string; body: string }[] =
            JSON.parse(
              await readFile(resolve(root, "content/posts.json"), "utf8"),
            )
          return posts.map((post) => ({
            path: `/posts/${post.slug}`,
            key: hash(post),
          }))
        },
        revision: "posts-v1",
      },
    }),
    octane(),
  ],
})
```

Each path must match a static route and be concrete, unique, and free of query
strings or fragments. Paths are app-relative, before `routing.basename`.
The callback can return an array, iterable, or async iterable. Concrete static
routes in the manifest are also included automatically.

The key versions the data used to render one page. Here, changing one post
changes only that post's key. Flamefront also fingerprints rendering inputs,
including route, shell, layout, and server-entry source. Shared rendering
changes can therefore invalidate multiple pages.

Use `revision` to version external inputs that page keys do not capture, such
as a shared content transformation rule or external service configuration.
Include every content input that affects a page in its key; a cache hit skips
rendering and can otherwise preserve stale data.

| Page type                 | Default when `prerender` is enabled               |
| ------------------------- | ------------------------------------------------- |
| Markdown                  | Source bytes provide the content key.             |
| Component or MDX          | Renders every build unless given an explicit key. |
| Any page with `key: null` | Renders every build without caching that page.    |

For an existing site with only concrete Markdown routes, `prerender: {}` is
enough to enable the default cache.

## Verify reuse

1. Run `pnpm exec ff build --force-prerender` to populate fresh entries. For
   this two-page app, expect the summary:

   ```text
   Prerendered 2 pages, reused 0 cached pages.
   ```

2. Run `pnpm exec ff build` without changing inputs. Expect:

   ```text
   Reused dist/client/posts/hello/index.html.
   Reused dist/client/posts/next/index.html.
   Prerendered 0 pages, reused 2 cached pages.
   ```

3. Change only the first post's `body` in `content/posts.json`, then build
   again. Expect one generated page and one reused page. Inspect
   `dist/client/posts/hello/index.html` for the new body.

Every build assembles the complete output, including HTML, route data,
fragments, and current asset references. Cache reuse does not require keeping
the previous `dist/` directory. Preview the result with `pnpm exec ff preview`
and visit `/posts/hello`.

## Preserve the cache in CI

Save and restore `.flamefront/cache` between builds; keep it out of Git.
Restore it before `ff build` and save it after a successful build. The default
cache namespace includes the absolute project root, so reuse requires the
same checkout path across runs. A restored cache at a different root is safe
but will miss existing entries.

Set `prerender.cache: false` to disable cache reads and writes. For another
store, supply a `PrerenderCache` from `flamefront/prerender`, implementing
`get(key): Promise<Uint8Array | null>` and
`put(key, value): Promise<void>`. Cache failures fall back to rendering or
continue without saving an entry.

`pnpm exec ff build --force-prerender` bypasses reads and refreshes the cache.
Deploy the output as described in [Build and deploy](deployment.md).
