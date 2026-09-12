import { Link, useActionData, useLoaderData } from "@octanejs/remix-router"
import {
  data,
  redirect,
  type ActionArgs,
  type LoaderArgs,
} from "flamefront/server"
import { createTopic, listTopics, type ForumContext } from "./forum.server.ts"

export async function loader({ context }: LoaderArgs<ForumContext>) {
  return { topics: await listTopics(context.db) }
}

export async function action({ request, context }: ActionArgs<ForumContext>) {
  const form = await request.formData()
  const title = String(form.get("title") ?? "").trim()
  const body = String(form.get("body") ?? "").trim()
  const author = String(form.get("author") ?? "Anonymous").trim() || "Anonymous"
  if (title.length < 3 || title.length > 100) return data(
    { error: "Use a title between 3 and 100 characters." },
    { status: 400 },
  )
  if (body.length < 3 || body.length > 5000) return data(
    { error: "Write between 3 and 5,000 characters." },
    { status: 400 },
  )
  const topicId = await createTopic(context.db, { title, body, author })
  return redirect(`/forum/${topicId}`)
}

export default function ForumPage() @{
  const { topics } = useLoaderData<typeof loader>()
  const result = useActionData<typeof action>()
  <main class="page stack">
    <section class="measure">
      <p class="eyebrow">Server rendered</p>
      <h1>Forum</h1>
      <p class="muted">
        Questions and notes from people building with Flamefront. Local
        development uses SQLite; deployment can point the same adapter at Turso.
      </p>
    </section>
    <section aria-labelledby="topics-title">
      <h2 id="topics-title">Topics</h2>
      @for (const topic of topics; key topic.id) {
        <Link className="topic" to={`/forum/${topic.id}`}>
          <strong class="topic-title">{topic.title}</strong>
          <br />
          <span class="muted">
            {topic.author}
            ·
            {topic.postCount}

            {topic.postCount === 1 ? "post" : "posts"}
          </span>
        </Link>
      } @empty {
        <p class="muted">No topics yet. Start the first one.</p>
      }
    </section>
    <section>
      <h2>Start a topic</h2>
      <form class="forum-form" method="post">
        <label>
          Name
          <input name="author" maxLength={40} autoComplete="name" />
        </label>
        <label>
          Title
          <input name="title" required minLength={3} maxLength={100} />
        </label>
        <label>
          Message
          <textarea
            name="body"
            required
            minLength={3}
            maxLength={5000}
            rows={6}
          ></textarea>
        </label>
        @if (result?.error) {
          <p class="error" role="alert">{result.error}</p>
        }
        <button>Post topic</button>
      </form>
    </section>
  </main>
}
