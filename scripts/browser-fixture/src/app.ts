import { defineApp, route } from "flamefront"

export const app = defineApp({
  shell: "/src/BrowserShell.tsrx",
  routing: {
    basename: "/guide",
    dataPath: "/guide/__flamefront/data",
  },
  routes: [
    route("/client", "/src/ClientPage.tsrx", { render: "client" }),
    route("/destination", "/src/DestinationPage.tsrx", { render: "client" }),
    route("/server", "/src/ServerPage.tsrx", { render: "server" }),
    route("/static", "/src/StaticPage.tsrx", { render: "static" }),
    route("/error", "/src/ErrorPage.tsrx", { render: "server" }),
    route("/redirect", "/src/RedirectPage.tsrx", { render: "server" }),
  ],
})
