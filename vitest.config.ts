import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Default test run excludes tests/integration/**. Those hit real Supabase
// with real data (e.g., production portal_email) and need a seeded DB state
// to be deterministic. Run them explicitly with:
//   npx vitest run tests/integration
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.git/**',
      'tests/integration/**',
    ],
  },
});
