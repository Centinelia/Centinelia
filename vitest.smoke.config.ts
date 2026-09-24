import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// Config para smoke integration tests bajo supabase/__tests__/.
// Golpea Supabase real via createAdminClient — cada test debe llamar
// assertNotProdOrAllowed() en beforeAll para evitar filas huerfanas en prod.
//
// Ejecucion:
//   npm run test:smoke
//   npm run test:smoke -- 2026-09-24-perfiles-vivos-smoke
loadEnv({ path: path.resolve(__dirname, '.env.local') });

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['supabase/__tests__/**/*.integration.test.ts'],
    testTimeout: 60000,
  },
});
