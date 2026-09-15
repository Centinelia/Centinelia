// Temporary vitest config for running meta publisher tests from centinelia node_modules.
// Usage: node_modules/.bin/vitest run --config vitest.meta.config.mjs
import { defineConfig } from 'file:///C:/Users/Nazre/centinelia/node_modules/vitest/dist/config.js';
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
  },
});
