import { Link } from "@octanejs/remix-router"

export default function HomePage() @{
  <main class="page">
    <section class="measure">
      <p class="eyebrow">The app framework for Octane</p>
      <h1 class="lede">
        Build static pages, server-rendered features, and browser apps together.
        Keep shared UI running as you move between them.
      </h1>
      <div class="cluster">
        <Link className="button" to="/docs/create-app">Create an app</Link>
        <a href="https://github.com/aleclarson/flamefront">View source</a>
      </div>
    </section>
    <section class="proof-grid" aria-label="This site demonstrates Flamefront">
      <article class="proof">
        <p class="eyebrow">Static</p>
        <h2>
          <Link to="/docs">Pre-rendered docs</Link>
        </h2>
        <p class="muted">
          Content pages reuse cached rendering between builds.
        </p>
      </article>
      <article class="proof">
        <p class="eyebrow">Server</p>
        <h2>
          <Link to="/forum">A working forum</Link>
        </h2>
        <p class="muted">Loaders and forms read and write durable data.</p>
      </article>
      <article class="proof">
        <p class="eyebrow">Persistent</p>
        <h2>Ambient audio</h2>
        <p class="muted">
          Start the player above. The shell survives route changes.
        </p>
      </article>
      <article class="proof">
        <p class="eyebrow">Client</p>
        <h2>
          <Link to="/play">An editable toy</Link>
        </h2>
        <p class="muted">
          A browser-only route turns source into a live preview.
        </p>
      </article>
    </section>
  </main>
}
