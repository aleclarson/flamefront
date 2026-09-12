import { defineApp, serverRoute } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [serverRoute("/", "/src/HomePage.tsrx")],
})
