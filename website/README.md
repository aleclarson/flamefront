# Flamefront website

The public Flamefront site is itself a Flamefront application. It combines
incrementally pre-rendered documentation, a server-rendered forum, a persistent
ambient player, and a client-rendered Octane compiler playground.

```sh
pnpm --filter flamefront-website dev
```

The forum uses `file:.data/forum.db` locally. To use Turso, copy
`.env.example` to `.env` and provide the database URL and token. Run a second
unchanged production build to observe documentation cache reuse:

```sh
pnpm --filter flamefront-website build
pnpm --filter flamefront-website build
```

Each build writes its measured prerender counts to `dist/client/build/index.json`.
The Cloudflare Workers deployment adapter remains future integration work; the
application currently builds for Flamefront's Node target.
