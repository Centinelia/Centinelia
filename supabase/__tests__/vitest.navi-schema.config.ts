/**
 * Minimal vitest config for running navi social schema integration tests.
 * Uses centinelia's node_modules (worktree shares the main repo via git worktree).
 *
 * Colocated with the tests it covers at supabase/__tests__/.
 *
 * Run from worktree root:
 *   NODE_PATH=../centinelia/node_modules \
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   ../centinelia/node_modules/.bin/vitest run --config supabase/__tests__/vitest.navi-schema.config.ts
 */
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Config file lives at supabase/__tests__ — walk up 2 levels to reach worktree root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worktreeRoot = path.resolve(__dirname, '..', '..');

export default defineConfig({
  resolve: {
    alias: {
      // '@' resolves to src/ relative to worktree root, not this config file
      '@': path.resolve(worktreeRoot, 'src'),
    },
  },
  test: {
    include: ['supabase/__tests__/**/*.test.ts'],
    testTimeout: 60000,
    setupFiles: [],  // No DOM setup needed for DB integration tests
  },
});
