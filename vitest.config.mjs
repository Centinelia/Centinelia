import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load .env.local
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.env.local') });

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
