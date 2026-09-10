import { defineApp, layout, route } from "flamefront"

export const app = defineApp({
  shell: "/src/AppShell.tsrx",
  routes: [
    route("/", "/src/HomePage.tsrx", {
      render: "server",
      hydration: "full",
    }),
    layout("/src/AppLayout.tsrx", [
      route("/products/:productId", "/src/ProductPage.tsrx", {
        render: "server",
        hydration: { when: "interaction", events: ["click", "focusin"] },
      }),
      route("/hydration", "/src/HydrationLab.tsrx", {
        render: "server",
        hydration: "deferred",
      }),
      route("/server-static", "/src/ServerStaticPage.tsrx", {
        render: "server",
        hydration: "none",
      }),
      route("/static-interactive", "/src/StaticInteractivePage.tsrx", {
        render: "static",
        hydration: "deferred",
      }),
      route("/workspace", "/src/WorkspacePage.tsrx", {
        render: "client",
      }),
      route("/workspace/settings", "/src/SettingsPage.tsrx", {
        render: "client",
      }),
    ]),
    route("/about", "/src/AboutPage.tsrx", {
      render: "static",
      hydration: "none",
    }),
  ],
})
