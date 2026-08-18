import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 4179;
const base = `http://127.0.0.1:${port}`;
const preview = spawn(process.execPath, [resolve(root, 'scripts/preview.mjs')], {
	cwd: root,
	env: { ...process.env, PORT: String(port) },
	stdio: ['ignore', 'pipe', 'pipe'],
});

let previewOutput = '';
preview.stdout.on('data', (chunk) => {
	previewOutput += chunk;
});
preview.stderr.on('data', (chunk) => {
	previewOutput += chunk;
});

async function waitForPreview() {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		try {
			const response = await fetch(`${base}/ssr`);
			if (response.status === 200) return;
		} catch {
			// The preview process is still starting.
		}
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
	}
	throw new Error(`Preview did not start.\n${previewOutput}`);
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

try {
	await waitForPreview();

	const ssr = await fetch(`${base}/ssr`).then((response) => response.text());
	assert(ssr.includes('SSR route with deferred hydration'), 'SSR label is missing from the initial response.');
	assert(ssr.includes('data-testid="deferred-panel"'), 'SSR response is missing the deferred boundary content.');

	const ssg = await fetch(`${base}/ssg`).then((response) => response.text());
	assert(ssg.includes('>SSG route</h1>'), 'SSG label is missing from the generated document.');
	assert(!ssg.includes('type="module"'), 'SSG output unexpectedly includes a client module.');

	for (const path of ['/spa-one', '/spa-two']) {
		const spa = await fetch(`${base}${path}`).then((response) => response.text());
		assert(spa.includes('/assets/'), `${path} did not receive the Vite SPA shell.`);
		assert(!spa.includes('SPA route one'), `${path} was server-rendered instead of client-only.`);
		assert(!spa.includes('SPA route two'), `${path} was server-rendered instead of client-only.`);
	}

	const generatedSsg = await readFile(resolve(root, 'dist/client/ssg/index.html'), 'utf8');
	assert(generatedSsg.includes('data-render-mode="ssg"'), 'Build output is missing the SSG mode marker.');

	console.log('SSR response contains its label and deferred HTML.');
	console.log('SSG output contains its label and no client module.');
	console.log('Both SPA paths return the Vite shell without server-rendered labels.');
} finally {
	preview.kill('SIGTERM');
}
