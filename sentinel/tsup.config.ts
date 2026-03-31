import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  dts: true,
  // Keep runtime dependencies external (express, cors, etc.)
  external: ['express', 'cors'],
});
