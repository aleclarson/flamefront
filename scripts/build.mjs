import { rm, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { app } from '../src/routes.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const ssgRoute = app.routes.find((route) => route.render === 'ssg');

if (!ssgRoute) throw new Error('The route manifest must define an SSG route.');

await rm(dist, { recursive: true, force: true });

await build({
	root,
	configFile: resolve(root, 'vite.config.ts'),
	build: {
		outDir: 'dist/client',
		manifest: true,
	},
});

await build({
	root,
	configFile: resolve(root, 'vite.config.ts'),
	build: {
		ssr: resolve(root, 'src/entry-server.ts'),
		outDir: 'dist/server',
		rollupOptions: {
			output: {
				entryFileNames: 'entry-server.js',
			},
		},
	},
});

const serverEntry = await import(`${pathToFileURL(resolve(dist, 'server/entry-server.js')).href}?build=${Date.now()}`);
const ssgHtml = await serverEntry.renderSsgDocument();
const ssgPath = ssgRoute.path.replace(/^\/+|\/+$/g, '') || 'index';
const ssgDir = resolve(dist, 'client', ssgPath);

await mkdir(ssgDir, { recursive: true });
await writeFile(resolve(ssgDir, 'index.html'), ssgHtml);

console.log(`Generated dist/client/${ssgPath}/index.html with octane/static prerender().`);
