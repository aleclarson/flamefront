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

test("lets the Nitro adapter take precedence over a runtime target", () => {
  assert.deepEqual(resolveFlamefrontOutput({ adapter: "nitro" }), {
    adapter: "nitro",
  })
  assert.deepEqual(
    resolveFlamefrontOutput({ adapter: "nitro", target: "node" }),
    { adapter: "nitro", target: "node" },
  )
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
    () =>
      resolveFlamefrontOutput({
        adapter: "alien" as never,
      }),
    /adapter must be "nitro"/,
  )
})
