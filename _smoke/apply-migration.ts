/**
 * Aplica una migración SQL directo a la base linked de Supabase vía CLI,
 * sin pasar por Supabase SQL Editor (que mangle caracteres de copy-paste).
 *
 * Internamente invoca `supabase db query --linked -f <path>`. Si el proyecto
 * no está linked, imprime instrucciones.
 *
 * Uso:
 *   npx tsx _smoke/apply-migration.ts supabase/migrations/<file>.sql
 *   npx tsx _smoke/apply-migration.ts <archivo-arbitrario.sql>
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const argPath = process.argv[2];
if (!argPath) {
  console.error('Uso: npx tsx _smoke/apply-migration.ts <path/to/file.sql>');
  process.exit(1);
}

const fullPath = resolve(process.cwd(), argPath);
if (!existsSync(fullPath)) {
  console.error(`[apply-migration] Archivo no existe: ${fullPath}`);
  process.exit(1);
}

console.log(`[apply-migration] Aplicando ${fullPath} vía supabase CLI...\n`);

const result = spawnSync('supabase', ['db', 'query', '--linked', '-f', fullPath], {
  stdio:  'inherit',
  shell:  process.platform === 'win32',
});

if (result.error) {
  console.error('\n[apply-migration] ERROR invocando supabase CLI:', result.error.message);
  console.error('  ¿Está instalada? Prueba: supabase --version');
  console.error('  ¿Está linked? Prueba: supabase link --project-ref <ref>');
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`\n[apply-migration] Falló con exit code ${result.status}.`);
  console.error('  Si dice "project not linked", corre: supabase link --project-ref <ref>');
  console.error('  Si da error de SQL, revisa el archivo y vuelve a correr.');
  process.exit(result.status ?? 1);
}

console.log('\n[apply-migration] OK');
