// Sube el template rebuild final al bucket + re-analiza con Claude + guarda mapping.
// El .xlsx viene del rebuild-tortilleria-template.ts (single-sheet limpio).
//
// Uso: npx tsx scripts/upload-rebuilt-template.ts <path>

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import fs from 'node:fs';

const NELIA_AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const PORTAL_EMAIL   = 'servicioalcliente@tortillaestrella.com.mx';
const FILENAME       = 'BITACORA TORTILLERIA (formato final).xlsx';

async function main() {
  const path = process.argv[2];
  if (!path || !fs.existsSync(path)) throw new Error('Path required and must exist');

  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { analyzeTemplate }   = await import('../src/lib/bitacora/template-analyzer');
  const supabase = createAdminClient();

  console.log(`Leyendo ${path}`);
  const buffer = fs.readFileSync(path);
  console.log(`  Size: ${buffer.length} bytes\n`);

  console.log('Analizando con Claude Sonnet...');
  const t0 = Date.now();
  const analysis = await analyzeTemplate(buffer);
  console.log(`  Latencia: ${Date.now() - t0}ms`);
  console.log(`  Sheet: ${analysis.mapping.sheet_name}`);
  console.log(`  Insertion row: ${analysis.mapping.insertion_row}`);
  console.log(`  Columns mapeadas:`);
  const humanOnlySet = new Set(analysis.mapping.human_only_columns);
  for (const [col, field] of Object.entries(analysis.mapping.columns)) {
    console.log(`    ${col} → ${field}${humanOnlySet.has(col) ? '  [SOLO YO]' : ''}`);
  }
  console.log(`  Grid: ${JSON.stringify(analysis.mapping.verification_grid ?? {})}`);
  console.log(`  Sugerencias (${analysis.suggestions.length}):`);
  for (const s of analysis.suggestions) {
    console.log(`    [${s.severity}] ${s.type}${s.col ? ` col ${s.col}` : ''}: ${s.rationale.slice(0, 100)}`);
  }
  console.log();

  const timestamp = Date.now();
  const storagePath = `${PORTAL_EMAIL}/${NELIA_AGENT_ID}/template-${timestamp}.xlsx`;
  console.log(`Subiendo a bucket: ${storagePath}`);
  const { error: upErr } = await supabase.storage
    .from('bitacora-templates')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert:      true,
    });
  if (upErr) throw new Error(`upload: ${upErr.message}`);

  const templatePayload = {
    url:           storagePath,
    filename:      FILENAME,
    mapping:       analysis.mapping,
    suggestions:   analysis.suggestions,
    uploaded_at:   new Date().toISOString(),
    uploaded_by:   'admin-rebuild-final',
    ai_usage:      analysis.usage,
    charged_tasks: 0,
  };
  const { error: dbErr } = await supabase
    .from('voice_agents')
    .update({ bitacora_template: templatePayload })
    .eq('id', NELIA_AGENT_ID);
  if (dbErr) throw new Error(`db: ${dbErr.message}`);

  console.log('\nMapping guardado en DB. Runtime usará este template para el correo del sábado.');
}

main().catch(err => { console.error(err); process.exit(1); });
