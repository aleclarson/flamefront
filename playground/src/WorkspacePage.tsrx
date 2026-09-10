import { useLoaderData } from "@octanejs/remix-router"
import type { LoaderArgs } from "flamefront/server"
import { useState } from "octane"
import { RouteFacts } from "./RouteFacts.tsrx"

type WorkspaceData = {
  message: string;
  items: readonly string[];
}

export async function loader({ request }: LoaderArgs): Promise<WorkspaceData> {
  return {
    message: `Browser fetched loader data for ${new URL(request.url).pathname}.`,
    items: [
      "Inspect the route graph",
      "Prefetch loader data",
      "Keep shell state",
    ],
  }
}

export function WorkspacePage() @{
  const loaderData = useLoaderData<WorkspaceData>()
  const [completed, setCompleted] = useState(0)

  <main class="page" data-route="/workspace" data-render-mode="client">
    <section class="content">
      <p class="eyebrow">Browser-only route</p>
      <h1>Workspace</h1>
      <p>
        This client route mounts in the browser after its loader endpoint
        resolves.
      </p>
      <RouteFacts pathname="/workspace" loader={loaderData.message} />
      <ul class="task-list">
        @for (const item of loaderData.items; index index; key item) {
          <li class={index < completed ? "complete" : ""}>{item}</li>
        }
      </ul>
      <button
        data-testid="workspace-progress"
        onClick={() => setCompleted(
          Math.min(completed + 1, loaderData.items.length),
        )}
      >
        Complete next item
      </button>
    </section>
  </main>
}

export default WorkspacePage
