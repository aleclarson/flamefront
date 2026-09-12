import { startOctaneClient } from "flamefront/octane/client"
import { app } from "./app.ts"
import "./styles.css"

await startOctaneClient({ app })
