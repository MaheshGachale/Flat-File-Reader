export default [
  // Extension bundle
  {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['vscode', 'mock-aws-s3', 'aws-sdk', 'nock'],
    outfile: 'out/extension.js',
    minify: true,
    loader: { '.html': 'text' },
  },
  // Webview bundle
  {
    entryPoints: ['webview/src/index.tsx'],
    bundle: true,
    outfile: 'webview/dist/bundle.js',
    platform: 'browser',
    format: 'iife',
    globalName: 'FFE',
    jsx: 'automatic',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.css': 'empty' }, // Ignore CSS imports since styles.css is loaded separately
  },
];
