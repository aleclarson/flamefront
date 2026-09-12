import * as devalue from "devalue"

/** The structural value returned by the router's `data()` helper. */
export interface ActionDataWithResponseInit<Data = unknown> {
  readonly type: "DataWithResponseInit"
  readonly data: Data
  readonly init: ResponseInit | null
}

/** The Standard Schema contract accepted by `action()`. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) =>
      | { readonly value: Output }
      | { readonly issues: readonly StandardSchemaIssue[] }
      | Promise<
          | { readonly value: Output }
          | { readonly issues: readonly StandardSchemaIssue[] }
        >
  }
}

export interface StandardSchemaIssue {
  readonly message: string
  readonly path?: readonly (string | number | symbol)[]
  readonly [key: string]: unknown
}

export type StandardSchema = StandardSchemaV1<unknown, unknown>

type SchemaInput<Schema> =
  Schema extends StandardSchemaV1<infer Input, unknown> ? Input : unknown

type SchemaOutput<Schema> =
  Schema extends StandardSchemaV1<unknown, infer Output> ? Output : unknown

/** The input tuple inferred from an action's validator tuple. */
export type ActionInput<Schemas extends readonly StandardSchema[]> = {
  -readonly [Index in keyof Schemas]: SchemaInput<Schemas[Index]>
}

/** The validated output tuple inferred from an action's validator tuple. */
export type ActionOutput<Schemas extends readonly StandardSchema[]> = {
  -readonly [Index in keyof Schemas]: SchemaOutput<Schemas[Index]>
}

export interface ActionValidationError extends Error {
  readonly issues: readonly StandardSchemaIssue[]
  readonly status: 400
}

export interface ActionFunction<
  Args extends readonly unknown[] = readonly unknown[],
  Result = unknown,
> {
  (...args: Args): Promise<Result>
  readonly actionId?: string
}

function isDataWithResponseInit(
  value: unknown,
): value is ActionDataWithResponseInit<unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as Partial<ActionDataWithResponseInit>).type ===
      "DataWithResponseInit" &&
    "data" in value &&
    "init" in value,
  )
}

interface ActionRecord {
  readonly invoke: (args: readonly unknown[]) => Promise<unknown>
}

const actionRegistryKey = Symbol.for("flamefront:action-registry")
const actionRegistry = (() => {
  const globalValue = globalThis as typeof globalThis & {
    [actionRegistryKey]?: Map<string, ActionRecord>
  }
  const existing = globalValue[actionRegistryKey]

  if (existing) {
    return existing
  }

  const created = new Map<string, ActionRecord>()

  globalValue[actionRegistryKey] = created
  return created
})()

function validationError(
  issues: readonly StandardSchemaIssue[],
): ActionValidationError {
  const error = new Error("Invalid action arguments") as ActionValidationError

  Object.defineProperty(error, "name", {
    configurable: true,
    value: "ActionValidationError",
  })
  Object.defineProperty(error, "issues", {
    configurable: false,
    enumerable: true,
    value: issues,
  })
  Object.defineProperty(error, "status", {
    configurable: false,
    enumerable: true,
    value: 400,
  })
  return error
}

function schemaIssue(message: string, index?: number): StandardSchemaIssue {
  return {
    message,
    ...(index === undefined ? {} : { path: [index] }),
  }
}

async function validateActionArguments(
  schemas: readonly StandardSchema[] | undefined,
  args: readonly unknown[],
): Promise<readonly unknown[]> {
  if (!schemas) {
    return args
  }

  const issues: StandardSchemaIssue[] = []

  if (args.length !== schemas.length) {
    issues.push(
      schemaIssue(
        `Expected ${schemas.length} action argument${schemas.length === 1 ? "" : "s"}, received ${args.length}.`,
      ),
    )
  }

  const output = [] as unknown[]

  for (let index = 0; index < schemas.length; index += 1) {
    const schema = schemas[index]

    if (!schema || typeof schema["~standard"]?.validate !== "function") {
      throw new TypeError(
        `flamefront action validator at index ${index} does not implement Standard Schema.`,
      )
    }

    const result = await schema["~standard"].validate(args[index])

    if ("issues" in result && result.issues) {
      issues.push(
        ...result.issues.map((issue) => ({
          ...issue,
          path:
            issue.path && issue.path.length > 0
              ? [index, ...issue.path]
              : [index],
        })),
      )
      continue
    }

    if ("value" in result) {
      output[index] = result.value
    } else {
      issues.push(
        schemaIssue("Validator returned neither a value nor issues.", index),
      )
    }
  }

  if (issues.length > 0) {
    throw validationError(issues)
  }

  return output
}

function actionArguments(
  schemasOrHandler:
    readonly StandardSchema[] | ((...args: readonly unknown[]) => unknown),
  maybeHandler?: (...args: readonly unknown[]) => unknown,
): {
  readonly schemas: readonly StandardSchema[] | undefined
  readonly handler: (...args: readonly unknown[]) => unknown
} {
  if (typeof schemasOrHandler === "function") {
    return { schemas: undefined, handler: schemasOrHandler }
  }

  if (typeof maybeHandler !== "function") {
    throw new TypeError("flamefront action() requires a handler function.")
  }

  return { schemas: schemasOrHandler, handler: maybeHandler }
}

function createAction(
  id: string | undefined,
  schemasOrHandler:
    readonly StandardSchema[] | ((...args: readonly unknown[]) => unknown),
  maybeHandler?: (...args: readonly unknown[]) => unknown,
): ActionFunction {
  const { schemas, handler } = actionArguments(schemasOrHandler, maybeHandler)
  const invoke = async (...args: readonly unknown[]): Promise<unknown> => {
    const validated = await validateActionArguments(schemas, args)

    return handler(...validated)
  }

  const actionFunction = Object.assign(invoke, {
    ...(id === undefined ? {} : { actionId: id }),
  }) as ActionFunction

  if (id !== undefined) {
    actionRegistry.set(id, { invoke: (args) => actionFunction(...args) })
  }

  return actionFunction
}

/**
 * Declare a callable server action.
 *
 * The optional validator tuple supplies both the caller's input types and the
 * handler's validated output types. Without validators, arguments are
 * `unknown[]` and the handler must narrow them itself.
 */
export function action<const Schemas extends readonly StandardSchema[], Result>(
  schemas: Schemas,
  handler: (...args: ActionOutput<Schemas>) => Result | Promise<Result>,
): ActionFunction<ActionInput<Schemas>, Awaited<Result>>
export function action<Result>(
  handler: (...args: unknown[]) => Result | Promise<Result>,
): ActionFunction<readonly unknown[], Awaited<Result>>
/** @internal Used by the Vite transform to attach a stable action ID. */
export function action<const Schemas extends readonly StandardSchema[], Result>(
  id: string,
  schemas: Schemas,
  handler: (...args: ActionOutput<Schemas>) => Result | Promise<Result>,
): ActionFunction<ActionInput<Schemas>, Awaited<Result>>
/** @internal Used by the Vite transform to attach a stable action ID. */
export function action<Result>(
  id: string,
  handler: (...args: unknown[]) => Result | Promise<Result>,
): ActionFunction<readonly unknown[], Awaited<Result>>
export function action(
  first:
    | string
    | readonly StandardSchema[]
    | ((...args: readonly unknown[]) => unknown),
  second?:
    readonly StandardSchema[] | ((...args: readonly unknown[]) => unknown),
  third?: (...args: readonly unknown[]) => unknown,
): ActionFunction {
  if (typeof first === "string") {
    return createAction(
      first,
      second as
        readonly StandardSchema[] | ((...args: readonly unknown[]) => unknown),
      third,
    )
  }

  return createAction(
    undefined,
    first,
    second as ((...args: readonly unknown[]) => unknown) | undefined,
  )
}

export function getRegisteredAction(
  actionId: string,
): ActionRecord | undefined {
  return actionRegistry.get(actionId)
}

export interface SerializedActionError {
  readonly name: string
  readonly message: string
  readonly issues?: readonly StandardSchemaIssue[]
}

export interface ActionEnvelope {
  readonly protocol: "flamefront-action-v1"
  readonly type: "data" | "error"
  readonly value?: unknown
  readonly error?: SerializedActionError
  readonly status: number
  readonly headers: readonly (readonly [string, string])[]
}

function responseHeaders(
  init: ResponseInit | null | undefined,
): readonly (readonly [string, string])[] {
  return init?.headers ? [...new Headers(init.headers)] : []
}

function responseStatus(init: ResponseInit | null | undefined): number {
  return init?.status ?? 200
}

function serializedError(value: unknown): SerializedActionError {
  if (value instanceof Error) {
    const actionError = value as Error & {
      readonly issues?: readonly StandardSchemaIssue[]
    }

    return {
      name: value.name,
      message: value.message,
      ...(actionError.issues ? { issues: actionError.issues } : {}),
    }
  }

  return { name: "Error", message: String(value) }
}

function envelopeResponse(envelope: ActionEnvelope): Response {
  const headers = new Headers(
    envelope.headers.map(([name, value]) => [name, value] as [string, string]),
  )

  headers.set("Content-Type", "application/vnd.flamefront.action+devalue")
  return new Response(devalue.stringify(envelope), {
    status: envelope.status,
    headers,
  })
}

/** Encode an action return value or error as a Fetch response. */
export function actionResultResponse(value: unknown): Response {
  if (value instanceof Response) {
    return value
  }

  if (isDataWithResponseInit(value)) {
    return envelopeResponse({
      protocol: "flamefront-action-v1",
      type: "data",
      value: value.data,
      status: responseStatus(value.init),
      headers: responseHeaders(value.init),
    })
  }

  return envelopeResponse({
    protocol: "flamefront-action-v1",
    type: "data",
    value,
    status: 200,
    headers: [],
  })
}

/** Encode an action error as a Fetch response. */
export function actionErrorResponse(error: unknown): Response {
  if (error instanceof Response) {
    return error
  }

  if (isDataWithResponseInit(error)) {
    return envelopeResponse({
      protocol: "flamefront-action-v1",
      type: "error",
      error: serializedError(error.data),
      value: error.data,
      status: responseStatus(error.init),
      headers: responseHeaders(error.init),
    })
  }

  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status) || 500
      : 500

  return envelopeResponse({
    protocol: "flamefront-action-v1",
    type: "error",
    error: serializedError(error),
    status,
    headers: [],
  })
}

/** Execute an explicitly declared action by its generated stable ID. */
export async function executeRegisteredAction(
  actionId: string,
  args: readonly unknown[],
): Promise<Response> {
  const record = getRegisteredAction(actionId)

  if (!record) {
    const error = new Error("Flamefront action was not found.") as Error & {
      readonly status: number
    }

    Object.defineProperty(error, "status", {
      configurable: true,
      value: 404,
    })
    return actionErrorResponse(error)
  }

  try {
    return actionResultResponse(await record.invoke(args))
  } catch (error) {
    return actionErrorResponse(error)
  }
}

/** Parse the devalue argument-array body used by callable actions. */
export async function parseActionArguments(
  request: Request,
): Promise<readonly unknown[]> {
  let value: unknown

  try {
    value = devalue.parse(await request.text())
  } catch (error) {
    const parseError = new TypeError("Invalid Flamefront action arguments.", {
      cause: error,
    })

    Object.defineProperty(parseError, "status", {
      configurable: true,
      value: 400,
    })
    throw parseError
  }

  if (!Array.isArray(value)) {
    throw new TypeError("Flamefront action arguments must be an array.")
  }

  return value
}

export function actionProtocolEnvelope(
  value: unknown,
): value is ActionEnvelope {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as Partial<ActionEnvelope>).protocol === "flamefront-action-v1" &&
    ((value as Partial<ActionEnvelope>).type === "data" ||
      (value as Partial<ActionEnvelope>).type === "error"),
  )
}

export function actionResponseInit(
  envelope: Pick<ActionEnvelope, "status" | "headers">,
): ResponseInit {
  return {
    status: envelope.status,
    headers: new Headers(
      envelope.headers.map(
        ([name, value]) => [name, value] as [string, string],
      ),
    ),
  }
}

/** Check the request metadata used by browsers to enforce same-origin writes. */
export function isSameOriginActionRequest(request: Request): boolean {
  const url = new URL(request.url)
  const origin = request.headers.get("Origin")

  if (origin && origin !== url.origin) {
    return false
  }

  if (!origin) {
    const referer = request.headers.get("Referer")

    if (referer) {
      try {
        if (new URL(referer).origin !== url.origin) {
          return false
        }
      } catch {
        return false
      }
    }
  }

  return request.headers.get("Sec-Fetch-Site") !== "cross-site"
}
