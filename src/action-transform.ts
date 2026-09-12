import { createHash } from "node:crypto"
import { stringLiteral } from "@babel/types"
import { generate, parse, traverse, type Babel } from "./babel.ts"
import type { NormalizedRoutingOptions } from "./index.ts"

export interface ActionExport {
  readonly exportedName: string
  readonly localName: string
  readonly id: string
  readonly call: Babel.CallExpression
}

export interface ActionModuleTransform {
  readonly code: string
  readonly map: unknown
  readonly actions: readonly ActionExport[]
}

const actionModuleNames = new Set(["flamefront", "flamefront/server"])

function cleanModuleId(id: string): string {
  return id.split("?", 1)[0].replaceAll("\\", "/")
}

function exportedName(node: Babel.Identifier | Babel.StringLiteral): string {
  return node.type === "Identifier" ? node.name : node.value
}

function unwrapExpression(
  node: Babel.Expression | null,
): Babel.Expression | null {
  let current = node

  while (
    current &&
    (current.type === "TSAsExpression" ||
      current.type === "TSTypeAssertion" ||
      current.type === "TypeCastExpression")
  ) {
    current = current.expression
  }

  return current
}

function actionCall(
  node: Babel.Expression | null | undefined,
  bindings: ReadonlySet<string>,
): Babel.CallExpression | undefined {
  const expression = unwrapExpression(node ?? null)

  if (
    !expression ||
    expression.type !== "CallExpression" ||
    expression.callee.type !== "Identifier" ||
    !bindings.has(expression.callee.name)
  ) {
    return undefined
  }

  return expression
}

function actionId(moduleId: string, localName: string): string {
  const digest = createHash("sha256")
    .update(`${cleanModuleId(moduleId)}#${localName}`)
    .digest("hex")
    .slice(0, 24)

  return `flamefront:action:${digest}`
}

/** Find named action exports in a module that can be proxied to the browser. */
export function findActionExports(
  source: string,
  id = "action.ts",
): readonly ActionExport[] {
  const ast = parse(source, {
    sourceFilename: id,
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  })
  const actionBindings = new Set<string>()

  traverse(ast, {
    ImportDeclaration(path) {
      if (!actionModuleNames.has(path.node.source.value)) {
        return
      }

      for (const specifier of path.node.specifiers) {
        if (specifier.type !== "ImportSpecifier") {
          continue
        }

        const imported = specifier.imported
        const importedName =
          imported.type === "Identifier" ? imported.name : imported.value

        if (importedName === "action") {
          actionBindings.add(specifier.local.name)
        }
      }
    },
  })

  if (actionBindings.size === 0) {
    return []
  }

  const calls = new Map<string, Babel.CallExpression>()
  const addDeclaration = (declaration: Babel.VariableDeclaration) => {
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== "Identifier") {
        continue
      }

      const call = actionCall(declarator.init, actionBindings)

      if (call) {
        calls.set(declarator.id.name, call)
      }
    }
  }

  for (const statement of ast.program.body) {
    if (statement.type === "VariableDeclaration") {
      addDeclaration(statement)
    } else if (
      statement.type === "ExportNamedDeclaration" &&
      statement.declaration?.type === "VariableDeclaration"
    ) {
      addDeclaration(statement.declaration)
    }
  }

  const exports: ActionExport[] = []
  const seen = new Set<string>()
  const addExport = (localName: string, name: string) => {
    const call = calls.get(localName)

    if (!call || !name || name === "default") {
      return
    }

    const key = `${name}\0${localName}`

    if (seen.has(key)) {
      return
    }

    seen.add(key)
    exports.push({
      exportedName: name,
      localName,
      id: actionId(id, localName),
      call,
    })
  }

  for (const statement of ast.program.body) {
    if (statement.type !== "ExportNamedDeclaration") {
      continue
    }

    if (statement.declaration?.type === "VariableDeclaration") {
      for (const declarator of statement.declaration.declarations) {
        if (declarator.id.type === "Identifier") {
          addExport(declarator.id.name, declarator.id.name)
        }
      }
    }

    for (const specifier of statement.specifiers) {
      if (specifier.type !== "ExportSpecifier") {
        continue
      }

      if (specifier.local.type === "Identifier") {
        addExport(specifier.local.name, exportedName(specifier.exported))
      }
    }
  }

  return exports
}

/** Attach stable IDs to server-side action calls. */
export function transformServerActions(
  source: string,
  id = "action.ts",
): ActionModuleTransform | null {
  const ast = parse(source, {
    sourceFilename: id,
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  })
  const actions = findActionExports(source, id)

  if (actions.length === 0) {
    return null
  }

  const actionIds = new Map(
    actions.map((action) => [action.localName, action.id] as const),
  )

  traverse(ast, {
    VariableDeclarator(path) {
      if (path.node.id.type !== "Identifier") {
        return
      }

      const id = actionIds.get(path.node.id.name)
      const call = unwrapExpression(path.node.init ?? null)

      if (!id || !call || call.type !== "CallExpression") {
        return
      }

      const first = call.arguments[0]

      if (first?.type === "StringLiteral" && first.value === id) {
        return
      }

      call.arguments.unshift(stringLiteral(id))
    },
  })

  const generated = generate(ast, {
    sourceMaps: true,
    filename: id,
    sourceFileName: cleanModuleId(id),
  })

  return { code: generated.code, map: generated.map, actions }
}

function validExportName(name: string): boolean {
  return /^[$A-Z_a-z][$\w]*$/.test(name)
}

/** Generate a browser module containing typed-at-source action proxies. */
export function generateActionProxyModule(
  actions: readonly ActionExport[],
  routing: NormalizedRoutingOptions,
): string {
  const exports = actions
    .filter((action) => validExportName(action.exportedName))
    .map(
      (action) =>
        `export const ${action.exportedName} = createActionProxy(${JSON.stringify(action.id)}, routing);`,
    )
    .join("\n")

  return `// Generated by Flamefront.\nimport { createActionProxy } from "flamefront/action-client";\nconst routing = ${JSON.stringify(routing)};\n\n${exports}\n`
}
