import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// Config for integration tests only. Invoked via `npm run test:integration`.
// These tests hit real Supabase. Default TEST_PORTAL_EMAIL points to the
// synthetic org 'ops-ledger-test@test.centinelia.invalid' — override in
// .env.local if you want to target a different seeded org.
loadEnv({ path: path.resolve(__dirname, '.env.local') });

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
