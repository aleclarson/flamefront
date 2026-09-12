import assert from "node:assert/strict"
import { test } from "vitest"
import { data } from "@octanejs/remix-router"
import {
  action,
  actionResultResponse,
  executeRegisteredAction,
  isSameOriginActionRequest,
  type StandardSchemaV1,
} from "../src/action.ts"

const positiveNumber: StandardSchemaV1<number, number> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate(value) {
      return typeof value === "number" && value > 0
        ? { value }
        : { issues: [{ message: "Expected a positive number." }] }
    },
  },
}

const uppercase: StandardSchemaV1<string, string> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate(value) {
      return typeof value === "string"
        ? { value: value.toUpperCase() }
        : { issues: [{ message: "Expected a string." }] }
    },
  },
}

test("validates action arguments and preserves transformed outputs", async () => {
  const multiply = action(
    [positiveNumber, positiveNumber],
    (left, right) => left * right,
  )

  assert.equal(await multiply(2, 3), 6)
  await assert.rejects(multiply(-1, 3), (error: unknown) => {
    return (
      error instanceof Error &&
      error.name === "ActionValidationError" &&
      "issues" in error &&
      Array.isArray(error.issues)
    )
  })
})

test("encodes registered actions with devalue and response metadata", async () => {
  const registered = action("test:registered", [uppercase], (value) => ({
    value,
    now: new Date("2026-01-01T00:00:00.000Z"),
  }))

  assert.deepEqual(await registered("hello"), {
    value: "HELLO",
    now: new Date("2026-01-01T00:00:00.000Z"),
  })

  const response = await executeRegisteredAction("test:registered", ["hello"])

  assert.equal(response.status, 200)
  assert.match(
    response.headers.get("content-type") ?? "",
    /application\/vnd\.flamefront\.action\+devalue/,
  )
  assert.match(await response.text(), /flamefront-action-v1/)

  const created = actionResultResponse(
    data({ saved: true }, { status: 201, headers: { "X-Action": "yes" } }),
  )

  assert.equal(created.status, 201)
  assert.equal(created.headers.get("x-action"), "yes")
})

test("rejects cross-origin action metadata", () => {
  assert.equal(
    isSameOriginActionRequest(
      new Request("https://example.test/__flamefront/data", {
        method: "POST",
        headers: { Origin: "https://evil.test" },
      }),
    ),
    false,
  )
  assert.equal(
    isSameOriginActionRequest(
      new Request("https://example.test/__flamefront/data", {
        method: "POST",
        headers: { Origin: "https://example.test" },
      }),
    ),
    true,
  )
})
