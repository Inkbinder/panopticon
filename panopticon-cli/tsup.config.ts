import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  dts: true,
  // Keep the CLI shebang when bundling.
  banner: {
    js: '#!/usr/bin/env node',
  },
});
