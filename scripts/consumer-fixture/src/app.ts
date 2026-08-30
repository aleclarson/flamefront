import {
  defineApp,
  markdownRoute,
  route,
  serverRoute,
  staticRoute,
} from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [
    serverRoute("/", "/src/HomePage.tsrx"),
    staticRoute("/about", "/src/AboutPage.tsrx"),
    markdownRoute("/guide", "/src/Guide.md", { hydration: "none" }),
    route("/mdx", "/src/Guide.mdx", { render: "static", hydration: "none" }),
  ],
})
