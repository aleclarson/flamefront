import { Link, useActionData, useLoaderData } from "@octanejs/remix-router"
import {
  data,
  redirect,
  type ActionArgs,
  type LoaderArgs,
} from "flamefront/server"
import { createReply, getTopic, type ForumContext } from "./forum.server.ts"

export async function loader({ params, context }: LoaderArgs<
  ForumContext,
  "/forum/:topicId"
>) {
  return getTopic(context.db, params.topicId)
}
export async function action({ request, params, context }: ActionArgs<
  ForumContext,
  "/forum/:topicId"
>) {
  const form = await request.formData()
  const body = String(form.get("body") ?? "").trim()
  const author = String(form.get("author") ?? "Anonymous").trim() || "Anonymous"
  if (body.length < 3 || body.length > 5000) return data(
    { error: "Write between 3 and 5,000 characters." },
    { status: 400 },
  )
  await createReply(context.db, { topicId: params.topicId, body, author })
  return redirect(`/forum/${params.topicId}`)
}
export default function TopicPage() @{
  const topic = useLoaderData<typeof loader>()
  const result = useActionData<typeof action>()
  <main class="page stack">
    <p>
      <Link to="/forum">← Forum</Link>
    </p>
    <section class="measure">
      <p class="eyebrow">
        {topic.posts.length}

        {topic.posts.length === 1 ? "post" : "posts"}
      </p>
      <h1>{topic.title}</h1>
    </section>
    <section aria-label="Discussion">
      @for (const post of topic.posts; key post.id) {
        <article class="post">
          <p>{post.body}</p>
          <p class="muted">
            {post.author}
            ·
            <time
              datetime={post.createdAt}
            >{new Date(post.createdAt).toLocaleDateString()}</time>
          </p>
        </article>
      }
    </section>
    @if (!topic.locked) {
      <section>
        <h2>Reply</h2>
        <form class="forum-form" method="post">
          <label>
            Name
            <input name="author" maxLength={40} />
          </label>
          <label>
            Message
            <textarea
              name="body"
              required
              minLength={3}
              maxLength={5000}
              rows={5}
            ></textarea>
          </label>
          @if (result?.error) {
            <p class="error" role="alert">{result.error}</p>
          }
          <button>Post reply</button>
        </form>
      </section>
    }
  </main>
}
