import { build } from 'esbuild';
import { readFile } from 'fs/promises';

const config = await import('../esbuild.config.js');

for (const buildConfig of config.default) {
  await build(buildConfig);
}
