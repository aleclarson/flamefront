import { useEffect, useRef, useState } from "octane"

type HydrationProbeProps = {
  label: string;
  description: string;
  interactive?: boolean;
}

export function HydrationProbe({
  label,
  description,
  interactive = false,
}: HydrationProbeProps) @{
  const [hydrated, setHydrated] = useState(false)
  const [activations, setActivations] = useState(0)
  const hydratedByInteraction = useRef(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  <section class="hydration-probe" data-probe={label.toLowerCase()}>
    <h2>{label}</h2>
    <p>{description}</p>
    <p class="probe-status" data-testid={`probe-${label.toLowerCase()}`}>
      {hydrated
        ? label === "Interaction" && !hydratedByInteraction.current
          ? "Hydrated by a surrounding update."
          : `Hydrated by ${label.toLowerCase()}.`
        : "Server HTML is dormant."}
    </p>
    @if (interactive) {
      <button
        data-testid="interaction-probe-button"
        onClick={() => {
          if (!hydrated) {
            hydratedByInteraction.current = true
          }
          setActivations(activations + 1)
        }}
      >
        Interaction count:
        {activations}
      </button>
    }
  </section>
}
