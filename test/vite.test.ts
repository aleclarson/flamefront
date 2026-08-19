import assert from 'node:assert/strict';
import test from 'node:test';
import { stripRouteLoader } from '../src/vite.ts';

test('masks a route loader while preserving source offsets', () => {
	const source = `import { value } from './server.ts';

export async function loader({ request }) {
	const data = { nested: true };
	return \`\${request.url}:\${JSON.stringify(data)}\`;
}

export default function Route() @{
	<h1>Route</h1>
}
`;
	const transformed = stripRouteLoader(source);

	assert.equal(transformed.length, source.length);
	assert.equal(transformed.split('\n').length, source.split('\n').length);
	assert.doesNotMatch(transformed, /request\.url|nested: true/);
	assert.match(transformed, /export default function Route/);
});

test('leaves modules without a loader unchanged', () => {
	const source = 'export default function Route() {}';
	assert.equal(stripRouteLoader(source), source);
});
