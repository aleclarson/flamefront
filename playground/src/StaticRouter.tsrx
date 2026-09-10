import { RouterProvider } from "@octanejs/remix-router/dom"

export default function StaticRouter({
  router,
  context: _context,
}: {
  router: any;
  context: any;
}) @{
  <RouterProvider router={router} />
}
