import assert from "node:assert/strict"
import * as devalue from "devalue"
import { test } from "vitest"
import { redirect } from "@octanejs/remix-router"
import {
  actionRedirectStatusHeader,
  actionResultResponse,
} from "../src/action.ts"
import { createActionProxy, submitRouteAction } from "../src/action-client.ts"

test("calls a generated action proxy over the devalue endpoint", async () => {
  const originalFetch = globalThis.fetch
  const originalLocation = (
    globalThis as typeof globalThis & { location?: unknown }
  ).location
  let receivedUrl = ""
  let receivedArguments: unknown

  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { href: "https://example.test/app/products" },
  })
  globalThis.fetch = async (input, init) => {
    receivedUrl = String(input)
    receivedArguments = devalue.parse(String(init?.body))
    return actionResultResponse({ saved: true })
  }

  try {
    const renameProduct = createActionProxy("test:rename", {
      dataPath: "/app/__data",
    })

    assert.deepEqual(await renameProduct("p-1", "New name"), { saved: true })
    assert.equal(
      receivedUrl,
      "https://example.test/app/__data?action=test%3Arename",
    )
    assert.deepEqual(receivedArguments, ["p-1", "New name"])
  } finally {
    globalThis.fetch = originalFetch
    if (originalLocation === undefined) {
      Reflect.deleteProperty(globalThis, "location")
    } else {
      Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: originalLocation,
      })
    }
  }
})

test("submits enhanced page actions with the original form body", async () => {
  const originalFetch = globalThis.fetch
  let receivedRequest: Request | undefined

  globalThis.fetch = async (input) => {
    receivedRequest = input instanceof Request ? input : new Request(input)
    return actionResultResponse({ saved: true })
  }

  try {
    const request = new Request("https://example.test/products/p-1", {
      method: "POST",
      body: new URLSearchParams({ name: "New name" }),
    })
    const result = await submitRouteAction({ request })

    assert.deepEqual(result, { saved: true })
    assert.equal(
      receivedRequest?.url,
      "https://example.test/products/p-1?__flamefront_action=1",
    )
    assert.equal(receivedRequest?.method, "POST")
    assert.equal(
      receivedRequest?.headers.get("content-type"),
      "application/x-www-form-urlencoded;charset=UTF-8",
    )
    assert.equal(await receivedRequest?.text(), "name=New+name")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("passes action redirects through to the router or caller", async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () => redirect("/products")

  try {
    const request = new Request("https://example.test/products", {
      method: "POST",
    })

    await assert.rejects(submitRouteAction({ request }), (error: unknown) => {
      return error instanceof Response && error.status === 302
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("reconstructs redirects transported as non-redirect fetch responses", async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () =>
    new Response(null, {
      status: 204,
      headers: {
        [actionRedirectStatusHeader]: "303",
        Location: "/products",
      },
    })

  try {
    const request = new Request("https://example.test/products", {
      method: "POST",
    })

    await assert.rejects(submitRouteAction({ request }), (error: unknown) => {
      return (
        error instanceof Response &&
        error.status === 303 &&
        error.headers.get("location") === "/products" &&
        !error.headers.has(actionRedirectStatusHeader)
      )
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
