import { build } from 'esbuild';
import { mkdir, cp } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const webviewDir = join(root, 'webview');
const src = join(webviewDir, 'src', 'index.tsx');
const outdir = join(webviewDir, 'dist');

await mkdir(outdir, { recursive: true });

await build({
	entryPoints: [src],
	bundle: true,
	outfile: join(outdir, 'bundle.js'),
	platform: 'browser',
	format: 'iife',
	globalName: 'FFE',
	jsx: 'automatic',
	minify: true,
	define: { 'process.env.NODE_ENV': '"production"' },
});

// styles.css is produced by tailwind script 