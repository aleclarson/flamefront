export type NavigationItem = {
  path: string
  label: string
}

export const navigation: readonly NavigationItem[] = [
  {
    path: "/",
    label: "Overview",
  },
  {
    path: "/products/octane",
    label: "Product",
  },
  {
    path: "/hydration",
    label: "Hydration lab",
  },
  {
    path: "/server-static",
    label: "Server static",
  },
  {
    path: "/static-interactive",
    label: "Static interactive",
  },
  {
    path: "/workspace",
    label: "Workspace",
  },
  {
    path: "/workspace/settings",
    label: "Settings",
  },
  {
    path: "/about",
    label: "About",
  },
]
