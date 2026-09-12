import { startOctaneClient } from "flamefront/octane/client"
import { app } from "./app.ts"

await startOctaneClient({ app })

Object.assign(window, { __fixtureHydrated: true })
