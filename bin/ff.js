#!/usr/bin/env node

import { register } from "node:module"

register("./ff-loader.mjs", import.meta.url)
await import("../src/cli.ts")
