import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Default test run (npm test) excluye todos los tests que requieren Supabase
// real, Playwright, o fixtures de infraestructura. Para esos, usar:
//   npm run test:integration  → tests/integration/**
//   npm run test:smoke        → supabase/__tests__/**/*.integration.test.ts
//   npm run test:e2e          → tests/playwright/** (Playwright)
//
// Convención: cualquier test con sufijo `.integration.test.ts` o bajo
// `supabase/__tests__/`, `tests/e2e/`, `tests/integration/`, `tests/playwright/`
// se asume que necesita env/DB real y queda fuera del default.
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
      '**/.claude/**',
      'supabase/__tests__/**',
      'tests/e2e/**',
      'tests/integration/**',
      'tests/playwright/**',
      '**/*.integration.test.ts',
    ],
    // Tests que necesitan DOM se marcan con:
    //   // @vitest-environment jsdom
    // en la primera línea. El default sigue siendo 'node' para no romper los
    // ~80 tests unitarios existentes que corren en node y NO tocan DOM.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
});
