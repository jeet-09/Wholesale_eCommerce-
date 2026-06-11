import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'src/**/__tests__/**/*.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.schemas.ts',
        'src/**/*.types.ts',
        'src/**/*.routes.ts',
        'src/server.ts',
        'src/**/__tests__/**',
      ],
      thresholds: {
        // Target from README/RULES: 80%+ on business-critical modules.
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
