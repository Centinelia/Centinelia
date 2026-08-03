import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Loads .env.local into process.env if the vars aren't already set.
 * Handles quoted values and skips blank / commented lines.
 */
export function loadEnv() {
  const path = join(__dirname, '../../.env.local');
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
