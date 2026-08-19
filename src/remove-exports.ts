import { getBindingIdentifiers } from '@babel/types';
import {
	deadCodeElimination,
	findReferencedIdentifiers,
} from 'babel-dead-code-elimination';
import type { Babel, NodePath, ParseResult } from './babel.ts';
import { traverse } from './babel.ts';

function exportedIdentifierName(
	exported: Babel.Identifier | Babel.StringLiteral,
): string | undefined {
	return exported.type === 'Identifier' ? exported.name : exported.value;
}

function assertRemovableBinding(
	id: Babel.VariableDeclarator['id'],
	exportsToRemove: ReadonlySet<string>,
): void {
	if (id.type === 'Identifier') return;

	const bindingNames = new Set(Object.keys(getBindingIdentifiers(id)));
	for (const exportName of exportsToRemove) {
		if (bindingNames.has(exportName)) {
			throw new SyntaxError(
				`Flamefront cannot safely remove destructured route export "${exportName}".`,
			);
		}
	}
}

/**
 * Remove selected exports and declarations that became unreachable as a result.
 * This follows React Router's client-route transform: the pre-transform reference
 * set constrains DCE so unrelated, already-unused authored code is preserved.
 */
export function removeExports(
	ast: ParseResult<Babel.File>,
	exportNames: readonly string[],
): boolean {
	const exportsToRemove = new Set(exportNames);
	const referencedBeforeRemoval = findReferencedIdentifiers(ast);
	const pathsToRemove = new Set<NodePath<Babel.Node>>();
	const removedLocalNames = new Set<string>();
	let changed = false;

	traverse(ast, {
		ExportNamedDeclaration(path) {
			if (path.node.specifiers.length > 0) {
				path.node.specifiers = path.node.specifiers.filter((specifier) => {
					if (specifier.type !== 'ExportSpecifier') return true;
					const exportName = exportedIdentifierName(specifier.exported);
					if (!exportName || !exportsToRemove.has(exportName)) return true;

					changed = true;
					if (specifier.local.type === 'Identifier') {
						removedLocalNames.add(specifier.local.name);
					}
					return false;
				});

				if (path.node.specifiers.length === 0) pathsToRemove.add(path);
			}

			const declaration = path.node.declaration;
			if (declaration?.type === 'VariableDeclaration') {
				declaration.declarations = declaration.declarations.filter((declarator) => {
					assertRemovableBinding(declarator.id, exportsToRemove);
					if (
						declarator.id.type !== 'Identifier' ||
						!exportsToRemove.has(declarator.id.name)
					) {
						return true;
					}

					changed = true;
					removedLocalNames.add(declarator.id.name);
					return false;
				});

				if (declaration.declarations.length === 0) pathsToRemove.add(path);
			}

			if (
				(declaration?.type === 'FunctionDeclaration' ||
					declaration?.type === 'ClassDeclaration') &&
				declaration.id &&
				exportsToRemove.has(declaration.id.name)
			) {
				changed = true;
				removedLocalNames.add(declaration.id.name);
				pathsToRemove.add(path);
			}
		},
	});

	if (!changed) return false;

	// Remove metadata assignments such as `loader.cache = true` with the loader.
	traverse(ast, {
		ExpressionStatement(path) {
			if (!path.parentPath.isProgram()) return;
			const expression = path.node.expression;
			if (expression.type !== 'AssignmentExpression') return;
			const target = expression.left;
			if (
				target.type === 'MemberExpression' &&
				target.object.type === 'Identifier' &&
				removedLocalNames.has(target.object.name)
			) {
				pathsToRemove.add(path);
			}
		},
	});

	for (const path of pathsToRemove) path.remove();
	deadCodeElimination(ast, referencedBeforeRemoval);
	return true;
}
