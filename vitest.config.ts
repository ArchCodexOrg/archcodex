/**
 * @arch archcodex.util
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: {
    postcss: {}, // Disable postcss config discovery
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/types/**',
        'src/**/index.ts',      // Re-export files
        'src/**/types.ts',       // Type-only files
      ],
      // Coverage thresholds - enforced by npm run test:ci
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
