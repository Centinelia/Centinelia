/**
 * Config de vitest para correr en el worktree aislado.
 * Uso desde la raíz del worktree con la vitest del repo principal:
 *   node C:/Users/Nazre/centinelia/node_modules/vitest/dist/cli.js run \
 *     --config vitest.worktree.config.mjs \
 *     tests/lib/tags/whitelist.test.ts
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = __dirname;

const mainRepoModules = process.env.CENTINELIA_NODE_MODULES
  || path.resolve(WORKTREE_ROOT, '../centinelia/node_modules');

const vitestConfigPath = path.join(mainRepoModules, 'vitest', 'dist', 'config.js');
const { defineConfig } = await import(pathToFileURL(vitestConfigPath).href);

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(WORKTREE_ROOT, 'src'),
    },
  },
  test: {
    environment: 'node',
    root: WORKTREE_ROOT,
  },
});
