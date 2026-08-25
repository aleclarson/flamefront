# Flamefront design notes

These documents explain Flamefront to maintainers. They describe the contracts
that should survive refactors, the runtime flows that are hard to infer from one
file, and the reasons behind the unusual parts of the implementation.

Start with [onboarding](./onboarding.md). Read the other documents when working
on the corresponding part of the system:

- [Architecture](./architecture.md) defines ownership and dependency boundaries.
- [Lifecycles](./lifecycles.md) follows requests, navigation, and builds over time.
- [Static fragments](./static-fragments.md) explains fragment artifacts, nested
  hydration, and the router context bridge.
- [Invariants](./invariants.md) lists the properties that changes must preserve.

The package [README](../README.md) remains the user-facing API and setup guide.
The [brownfield migration guide](../docs/brownfield-migration.md) remains an
application migration guide. Do not duplicate those jobs here.

## Keeping these notes current

Write about responsibilities, inputs, outputs, and ownership. Mention source
files as entry points, not as the document's organizing principle. A refactor
that moves a helper should not require rewriting the design notes.

Update these documents when a change alters a lifecycle, moves responsibility
between subsystems, changes an invariant, or introduces a new persistent
artifact or protocol. Public option details and version requirements belong in
the package README instead.
