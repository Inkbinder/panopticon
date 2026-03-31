import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
  '**/*.config.*',
  '**/src/main.tsx',
  '**/eslint.config.*',
        '**/dist/**',
        '**/*.d.ts',
        '**/vite.config.*',
        '**/vitest.config.*',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
