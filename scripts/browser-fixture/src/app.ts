import { defineApp, route } from "flamefront"

const configuredShellHydration =
  typeof process === "undefined"
    ? import.meta.env?.VITE_SHELL_HYDRATION
    : process.env.VITE_SHELL_HYDRATION
const shellHydration = (configuredShellHydration ?? "full") as
  "full" | "deferred" | "none"

export const app = defineApp({
  document: "/src/Document.tsrx",
  shell: "/src/BrowserShell.tsrx",
  shellHydration,
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
