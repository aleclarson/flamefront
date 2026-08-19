import generatorModule from '@babel/generator';
import { parse, type ParseResult } from '@babel/parser';
import type { NodePath } from '@babel/traverse';
import traverseModule from '@babel/traverse';
import type * as Babel from '@babel/types';

type DefaultImport<T> = T | { default: T };

function unwrapDefault<T>(value: DefaultImport<T>): T {
	return (value as { default?: T }).default ?? (value as T);
}

// Babel's CommonJS packages have different shapes across Node and bundlers.
const traverse = unwrapDefault(
	traverseModule as DefaultImport<typeof import('@babel/traverse').default>,
);
const generate = unwrapDefault(
	generatorModule as DefaultImport<typeof import('@babel/generator').default>,
);

export { generate, parse, traverse };
export type { Babel, NodePath, ParseResult };
