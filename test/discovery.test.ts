import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { defineRoute } from '../src/index.ts';
import { discoverRoutes, extractRouteModule } from '../src/discovery.ts';

test('defineRoute validates metadata and preserves the component without a transform', () => {
	const Page = () => null;
	assert.equal(defineRoute(Page, { path: '/page', render: 'spa' }), Page);
	assert.throws(
		() =>
			defineRoute(Page, {
				path: '/page',
				// @ts-expect-error Runtime validation must also reject presentation fields.
				label: 'presentation',
			}),
		/not supported/,
	);
});

test('extracts and erases component-local route declarations', () => {
	const source = `import { defineRoute as route } from 'flamefront';

export function Page() @{
	<main>Page</main>
}

route(Page, {
	path: '/page',
	render: 'ssr',
	hydration: 'deferred',
});
`;
	const result = extractRouteModule(source, '/project/src/Page.tsrx', '/project');

	assert.deepEqual(result.routes, [
		{
			path: '/page',
			entry: '/src/Page.tsrx',
			component: 'Page',
			render: 'ssr',
			hydration: 'deferred',
		},
	]);
	assert.equal(result.code.includes('route(Page'), false);
	assert.equal(result.code.split('\n').length, source.split('\n').length);
});

test('discovers configured route sources and rejects duplicate paths', async () => {
	const root = await mkdtemp(join(tmpdir(), 'flamefront-'));
	try {
		await mkdir(join(root, 'src'));
		await writeFile(
			join(root, 'flamefront.config.json'),
			JSON.stringify({ routes: { include: ['src/**/*.tsrx'] } }),
		);
		const page = (name: string) => `import { defineRoute } from 'flamefront';
export function ${name}() @{ <main>${name}</main> }
defineRoute(${name}, { path: '/same', render: 'ssg' });
`;
		await writeFile(join(root, 'src', 'One.tsrx'), page('One'));
		assert.equal((await discoverRoutes(root))[0].component, 'One');

		await writeFile(join(root, 'src', 'Two.tsrx'), page('Two'));
		await assert.rejects(() => discoverRoutes(root), /route path is duplicated/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
