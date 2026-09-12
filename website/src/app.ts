import {
  clientRoute,
  defineApp,
  glob,
  layout,
  markdownRoute,
  serverRoute,
  staticRoute,
} from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [
    staticRoute("/", "/src/HomePage.tsrx"),
    layout("/src/DocsLayout.tsrx", [
      ...glob("/src/docs/**/*.md", (file) =>
        markdownRoute(file.routePath("/docs"), file.path),
      ),
    ]),
    serverRoute("/forum", "/src/ForumPage.tsrx"),
    serverRoute("/forum/:topicId", "/src/TopicPage.tsrx"),
    clientRoute("/play", "/src/PlaygroundPage.tsrx"),
  ],
})
