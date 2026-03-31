import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  dts: true,
  // Note: `src/index.ts` already has a shebang. Adding a tsup `banner` duplicates
  // it in `dist/index.js`, and Node ESM will throw a SyntaxError on the 2nd one.
});
