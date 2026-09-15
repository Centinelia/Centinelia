/**
 * Minimal vitest config for running navi social schema integration tests.
 * Uses centinelia's node_modules (worktree shares the main repo via git worktree).
 *
 * Run from worktree root:
 *   NODE_PATH=../centinelia/node_modules \
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   ../centinelia/node_modules/.bin/vitest run supabase/__tests__/...
 */
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['supabase/__tests__/**/*.test.ts'],
    testTimeout: 60000,
    setupFiles: [],  // No DOM setup needed for DB integration tests
  },
});
