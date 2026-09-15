// Worktree-specific vitest config for centinelia-navi.
//
// Use this config when running vitest from the main centinelia checkout
// (which has vitest in its node_modules) against the navi worktree tests:
//
//   cd C:/Users/Nazre/centinelia
//   node_modules/.bin/vitest run \
//     --config ../centinelia-navi/vitest.navi.config.ts \
//     ../centinelia-navi/src/lib/social/publishers/__tests__/meta.test.ts
//
// Unlike vitest.config.ts, this config does NOT include setupFiles because
// @testing-library/jest-dom is only needed for DOM tests, and the navi social
// tests are pure node. If DOM tests are added to this worktree in the future,
// ensure @testing-library packages are available before adding setupFiles back.

import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.git/**',
      '**/.claude/**',
    ],
  },
});
