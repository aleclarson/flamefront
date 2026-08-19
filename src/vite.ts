const loaderExport = /\bexport\s+(?:async\s+)?function\s+loader\s*\(/g;

function findBodyStart(source: string, start: number): number {
	let parentheses = 0;
	for (let index = start; index < source.length; index += 1) {
		if (source[index] === '(') parentheses += 1;
		if (source[index] === ')') parentheses -= 1;
		if (source[index] === '{' && parentheses === 0) return index;
	}
	return -1;
}

function findBodyEnd(source: string, start: number): number {
	let depth = 0;
	let quote: '"' | "'" | '`' | null = null;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;

	for (let index = start; index < source.length; index += 1) {
		const character = source[index];
		const next = source[index + 1];

		if (lineComment) {
			if (character === '\n') lineComment = false;
			continue;
		}
		if (blockComment) {
			if (character === '*' && next === '/') {
				blockComment = false;
				index += 1;
			}
			continue;
		}
		if (quote) {
			if (escaped) escaped = false;
			else if (character === '\\') escaped = true;
			else if (character === quote) quote = null;
			continue;
		}

		if (character === '/' && next === '/') {
			lineComment = true;
			index += 1;
			continue;
		}
		if (character === '/' && next === '*') {
			blockComment = true;
			index += 1;
			continue;
		}
		if (character === '"' || character === "'" || character === '`') {
			quote = character;
			continue;
		}
		if (character === '{') depth += 1;
		if (character === '}') {
			depth -= 1;
			if (depth === 0) return index + 1;
		}
	}

	return -1;
}

export function stripRouteLoader(source: string): string {
	loaderExport.lastIndex = 0;
	const match = loaderExport.exec(source);
	if (!match) return source;

	const bodyStart = findBodyStart(source, match.index);
	const bodyEnd = bodyStart < 0 ? -1 : findBodyEnd(source, bodyStart);
	if (bodyEnd < 0) throw new SyntaxError('Flamefront could not isolate the exported route loader.');

	const masked = source.slice(match.index, bodyEnd).replace(/[^\n\r]/g, ' ');
	return `${source.slice(0, match.index)}${masked}${source.slice(bodyEnd)}`;
}

export function flamefront() {
	return {
		name: 'flamefront:route-modules',
		enforce: 'pre' as const,
		transform(source: string, id: string, options?: { ssr?: boolean }) {
			if (options?.ssr || !id.split('?', 1)[0].endsWith('.tsrx')) return null;
			const code = stripRouteLoader(source);
			return code === source ? null : { code, map: null };
		},
	};
}
