# Flamefront field guide

This Octane project is a compact, observable tour of Flamefront. The explicit
route graph in [`src/app.ts`](src/app.ts) drives matching, Remix Router,
server and static documents, client routes, and hydration policy. Navigation
labels remain app display data in [`src/navigation.ts`](src/navigation.ts).

The graph has one eager `AppShell` and one pathless `AppLayout`:

- `AppShell` owns the shell counter, current path, transition state, and root
  `Outlet`. It stays mounted for every route.
- `AppLayout` owns the route header and its own counter. Its state survives
  navigation between the five app routes and resets when navigation leaves that
  layout branch.
- `/` and `/about` use only the shell, so neither page gets the app header.

The eight routes cover the public modes and hydration policies:

| Path                   | Initial mode | Hydration proof                                                   |
| ---------------------- | ------------ | ----------------------------------------------------------------- |
| `/`                    | `server`     | Full shell and page hydration                                     |
| `/products/:productId` | `server`     | Generated `interaction` boundary and dynamic loader params        |
| `/hydration`           | `server`     | Route-owned idle, visible, interaction, and media boundaries      |
| `/server-static`       | `server`     | `none`, leaving the page inert while shell and layout stay active |
| `/static-interactive`  | `static`     | Build-time HTML with an authored deferred boundary                |
| `/workspace`           | `client`     | Shell-only HTML, then client-rendered layout and route            |
| `/workspace/settings`  | `client`     | Client loader data and layout state retention                     |
| `/about`               | `static`     | Build-time HTML and `about/index.data.json` route data            |

Every `RouteHeader` item is a client-side router link. That includes the static
`/about` and `/static-interactive` links and the `none`-hydrated
`/server-static` link. Later navigation does not replace the document. Server
routes receive live request-time fragments. Static routes receive generated
fragment artifacts.

Server and static routes may use `full`, `deferred`, `none`, or a trigger
policy. `none` leaves both direct document and fragment HTML inert.

The app uses `@octanejs/vite-plugin` for TSRX compilation and Flamefront for the
multi-mode lifecycle. It has no filesystem routing convention.

```sh
pnpm dev
pnpm build
pnpm preview
pnpm test
pnpm test:e2e
pnpm routes
```

`ff routes` prints each path pattern, render mode, and hydration policy.
`test:e2e` builds the field guide and runs route, clean-consumer, and browser
acceptance tests. Those tests probe the built shell and each initial mode,
check route matching and layout structure, verify the static HTML and route-data
artifact, check that the `.server.ts` catalog marker is absent from client
chunks and source maps, and confirm production sourcemaps.
