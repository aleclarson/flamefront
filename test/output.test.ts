import assert from "node:assert/strict"
import { test } from "vitest"
import { resolveFlamefrontOutput } from "../src/output.ts"

test("defaults to the Web Fetch output", () => {
  assert.deepEqual(resolveFlamefrontOutput(), { adapter: "fetch" })
})

test("uses srvx when a runtime target is selected", () => {
  for (const target of ["node", "deno", "bun"] as const) {
    assert.deepEqual(resolveFlamefrontOutput({ target }), {
      adapter: "srvx",
      target,
    })
  }
})

test("rejects unknown output options at runtime", () => {
  assert.throws(
    () =>
      resolveFlamefrontOutput({
        target: "workerd" as never,
      }),
    /target must be one of "node", "deno", or "bun"/,
  )
  assert.throws(
    () => resolveFlamefrontOutput({ adapter: "nitro" } as never),
    /adapter is not supported/,
  )
})
