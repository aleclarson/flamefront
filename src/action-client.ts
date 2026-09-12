import * as devalue from "devalue"
import { data } from "@octanejs/remix-router"
import {
  actionProtocolEnvelope,
  actionResponseInit,
  type ActionEnvelope,
  type ActionFunction,
} from "./action.ts"
import {
  invalidateRouteDataCache,
  type RouteDataRoutingOptions,
} from "./route-data-client.ts"
import { invalidateRouteFragments } from "./fragment-client.ts"

export interface ActionRequestOptions extends RouteDataRoutingOptions {
  readonly signal?: AbortSignal
  /** Return router data helpers for page action submissions. */
  readonly router?: boolean
}

function resolveOrigin(url: string | URL): URL {
  const browserOrigin =
    typeof location === "undefined" ? undefined : location.origin

  if (!browserOrigin && typeof url === "string" && !URL.canParse(url)) {
    throw new TypeError(
      "flamefront action requests require an absolute URL outside the browser.",
    )
  }

  return new URL(url, browserOrigin)
}

function actionEndpoint(
  routing: RouteDataRoutingOptions,
  origin: string | URL,
): URL {
  return new URL(
    routing.dataPath ?? "/__flamefront/data",
    resolveOrigin(origin).origin,
  )
}

function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400
}

function headersFromEnvelope(envelope: ActionEnvelope): Headers | undefined {
  return envelope.headers.length > 0
    ? new Headers(
        envelope.headers.map(
          ([name, value]) => [name, value] as [string, string],
        ),
      )
    : undefined
}

function actionError(envelope: ActionEnvelope): Error {
  const serialized = envelope.error
  const error = new Error(
    serialized?.message ?? "Flamefront action request failed.",
  )

  error.name = serialized?.name ?? "ActionError"
  Object.defineProperty(error, "status", {
    configurable: true,
    enumerable: true,
    value: envelope.status,
  })

  if (serialized?.issues) {
    Object.defineProperty(error, "issues", {
      configurable: false,
      enumerable: true,
      value: serialized.issues,
    })
  }

  return error
}

async function decodeActionResponse(
  response: Response,
  options: ActionRequestOptions,
): Promise<unknown> {
  if (isRedirect(response)) {
    invalidateRouteDataCache()
    invalidateRouteFragments()
    throw response
  }

  const contentType = response.headers.get("Content-Type") ?? ""

  if (
    !contentType
      .toLowerCase()
      .includes("application/vnd.flamefront.action+devalue")
  ) {
    if (response.ok) {
      invalidateRouteDataCache()
      invalidateRouteFragments()
    }

    return response
  }

  let value: unknown

  try {
    value = devalue.parse(await response.text())
  } catch (error) {
    throw new Error(
      `flamefront action request returned an invalid response (${response.status}).`,
      { cause: error },
    )
  }

  if (!actionProtocolEnvelope(value)) {
    throw new Error("flamefront action response has an invalid protocol.")
  }

  const headers = headersFromEnvelope(value)
  const init = actionResponseInit(value)

  if (value.type === "error") {
    if (options.router && value.value !== undefined) {
      throw data(value.value, init)
    }

    throw actionError(value)
  }

  if (value.status >= 200 && value.status < 300) {
    invalidateRouteDataCache()
    invalidateRouteFragments()
  }

  if (options.router && (value.status !== 200 || headers)) {
    return data(value.value, init)
  }

  return value.value
}

/** Call a generated action proxy from browser code. */
export function createActionProxy<
  Args extends readonly unknown[] = readonly unknown[],
  Result = unknown,
>(
  actionId: string,
  routing: RouteDataRoutingOptions = {},
): ActionFunction<Args, Result> {
  return (async (...args: Args): Promise<Result> => {
    const endpoint = actionEndpoint(routing, location.href)

    endpoint.searchParams.set("action", actionId)
    const response = await globalThis.fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      redirect: "manual",
      headers: {
        "Content-Type": "application/vnd.flamefront.action+devalue",
        Accept: "application/vnd.flamefront.action+devalue",
      },
      body: devalue.stringify(args),
    })

    return (await decodeActionResponse(response, {})) as Result
  }) as ActionFunction<Args, Result>
}

/** Submit a page action request from the generated router action binding. */
export async function submitRouteAction(
  { request }: { readonly request: Request },
  options: ActionRequestOptions = {},
): Promise<unknown> {
  const url = new URL(request.url)

  url.searchParams.set("__flamefront_action", "1")
  const source = request.clone()
  const response = await globalThis.fetch(new Request(url, source), {
    redirect: "manual",
    credentials: "same-origin",
  })

  return decodeActionResponse(response, { ...options, router: true })
}
