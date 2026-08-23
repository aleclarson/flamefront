import { defineApp, route } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [
    route("/", "/src/HomePage.tsrx", { render: "server" }),
    route("/about", "/src/AboutPage.tsrx", { render: "static" }),
  ],
})
