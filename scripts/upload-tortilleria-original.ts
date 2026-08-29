// Sube el template ORIGINAL de Tortillería sin ninguna edición al xlsx.
// La limpieza (cols beyond mapped area + rows históricas) sucede en runtime
// via cleanCellsBeyondMappedArea + clearHistoricalDataRows.
//
// Uso: npx tsx scripts/upload-tortilleria-original.ts

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import fs from 'node:fs';

const NELIA_AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const PORTAL_EMAIL   = 'servicioalcliente@tortillaestrella.com.mx';
const SOURCE_PATH    = 'C:/Users/Nazre/Dropbox/PC/Downloads/Tortillería Estrella X Centinelia/BITACORA DE CLIENTES OCTUBRE 2023.xlsx';
const FILENAME       = 'BITACORA DE CLIENTES OCTUBRE 2023.xlsx';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { analyzeTemplate }   = await import('../src/lib/bitacora/template-analyzer');
  const supabase = createAdminClient();

  console.log(`Leyendo ${SOURCE_PATH} tal cual (sin edits)...`);
  const buffer = fs.readFileSync(SOURCE_PATH);
  console.log(`  Size: ${buffer.length} bytes\n`);

  console.log('Analizando con Claude Sonnet (sin tocar el archivo)...');
  const t0 = Date.now();
  const analysis = await analyzeTemplate(buffer);
  console.log(`  Latencia: ${Date.now() - t0}ms`);
  console.log(`  Tokens: in=${analysis.usage.input_tokens} out=${analysis.usage.output_tokens}`);
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
    console.log(`    [${s.severity}] ${s.type}${s.col ? ` col ${s.col}` : ''}: ${s.rationale.slice(0, 120)}...`);
  }
  console.log();

  const timestamp = Date.now();
  const storagePath = `${PORTAL_EMAIL}/${NELIA_AGENT_ID}/template-${timestamp}.xlsx`;
  console.log(`Subiendo archivo original a bucket: ${storagePath}`);
  const { error: upErr } = await supabase.storage
    .from('bitacora-templates')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert:      true,
    });
  if (upErr) throw new Error(`upload: ${upErr.message}`);
  console.log('  OK\n');

  const templatePayload = {
    url:            storagePath,
    filename:       FILENAME,
    mapping:        analysis.mapping,
    suggestions:    analysis.suggestions,
    uploaded_at:    new Date().toISOString(),
    uploaded_by:    'admin-original',
    ai_usage:       analysis.usage,
    charged_tasks:  0,
  };
  console.log('Guardando mapping + sugerencias en voice_agents.bitacora_template...');
  const { error: dbErr } = await supabase
    .from('voice_agents')
    .update({ bitacora_template: templatePayload })
    .eq('id', NELIA_AGENT_ID);
  if (dbErr) throw new Error(`db: ${dbErr.message}`);
  console.log('  OK\n');

  console.log('Done. Runtime cleanup (cleanCellsBeyondMappedArea + clearHistoricalDataRows) hará el resto al momento de generar el correo.');
}

main().catch(err => { console.error(err); process.exit(1); });
