import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Config for integration tests only. Invoked via `npm run test:integration`.
// These tests hit real Supabase. Set TEST_PORTAL_EMAIL in .env.local to a
// synthetic org you own before running.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['tests/integration/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    testTimeout: 30000,
  },
});
