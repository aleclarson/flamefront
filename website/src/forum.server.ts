import { createClient, type Client } from "@libsql/client"

export type ForumContext = { db: Client }

export function createForumContext(): ForumContext {
  const url = process.env.TURSO_DATABASE_URL ?? "file:.data/forum.db"

  return {
    db: createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }),
  }
}

export async function prepareForum(db: Client) {
  await db.batch(
    [
      `create table if not exists topics (
        id text primary key,
        title text not null,
        author text not null,
        created_at text not null,
        updated_at text not null,
        locked integer not null default 0
      )`,
      `create table if not exists posts (
        id text primary key,
        topic_id text not null references topics(id),
        author text not null,
        body text not null,
        created_at text not null,
        hidden integer not null default 0
      )`,
      `create index if not exists posts_topic_created on posts(topic_id, created_at)`,
    ],
    "write",
  )
}

function text(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "")
}

export async function listTopics(db: Client) {
  await prepareForum(db)
  const result = await db.execute(`
    select topics.id, topics.title, topics.author, topics.created_at,
      topics.updated_at, count(posts.id) as post_count
    from topics left join posts on posts.topic_id = topics.id and posts.hidden = 0
    group by topics.id order by topics.updated_at desc limit 50
  `)

  return result.rows.map((row) => ({
    id: text(row.id),
    title: text(row.title),
    author: text(row.author),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    postCount: Number(row.post_count),
  }))
}

export async function getTopic(db: Client, topicId: string) {
  await prepareForum(db)
  const topicResult = await db.execute({
    sql: "select * from topics where id = ?",
    args: [topicId],
  })
  const topic = topicResult.rows[0]

  if (!topic) {
    throw new Response("Topic not found", { status: 404 })
  }

  const posts = await db.execute({
    sql: "select * from posts where topic_id = ? and hidden = 0 order by created_at",
    args: [topicId],
  })

  return {
    id: text(topic.id),
    title: text(topic.title),
    author: text(topic.author),
    createdAt: text(topic.created_at),
    locked: Boolean(topic.locked),
    posts: posts.rows.map((post) => ({
      id: text(post.id),
      author: text(post.author),
      body: text(post.body),
      createdAt: text(post.created_at),
    })),
  }
}

export async function createTopic(
  db: Client,
  input: { title: string; body: string; author: string },
) {
  await prepareForum(db)
  const topicId = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.batch(
    [
      {
        sql: "insert into topics (id,title,author,created_at,updated_at) values (?,?,?,?,?)",
        args: [topicId, input.title, input.author, now, now],
      },
      {
        sql: "insert into posts (id,topic_id,author,body,created_at) values (?,?,?,?,?)",
        args: [crypto.randomUUID(), topicId, input.author, input.body, now],
      },
    ],
    "write",
  )
  return topicId
}

export async function createReply(
  db: Client,
  input: { topicId: string; body: string; author: string },
) {
  const topic = await getTopic(db, input.topicId)

  if (topic.locked) {
    throw new Response("Topic is locked", { status: 409 })
  }

  const now = new Date().toISOString()

  await db.batch(
    [
      {
        sql: "insert into posts (id,topic_id,author,body,created_at) values (?,?,?,?,?)",
        args: [
          crypto.randomUUID(),
          input.topicId,
          input.author,
          input.body,
          now,
        ],
      },
      {
        sql: "update topics set updated_at = ? where id = ?",
        args: [now, input.topicId],
      },
    ],
    "write",
  )
}
