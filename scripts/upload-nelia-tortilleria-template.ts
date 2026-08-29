// Sube el template de Tortillería Estrella para Nelia — admin path, sin cobrar pool.
// Usa el analyzer real (Claude Sonnet) para validar auto-detección human_only.
//
// Uso: npx tsx scripts/upload-nelia-tortilleria-template.ts

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

  console.log(`\nLeyendo ${SOURCE_PATH}...`);
  const buffer = fs.readFileSync(SOURCE_PATH);
  console.log(`  Size: ${buffer.length} bytes\n`);

  console.log('Analizando con Claude Sonnet...');
  const t0 = Date.now();
  const analysis = await analyzeTemplate(buffer);
  console.log(`  Latencia: ${Date.now() - t0}ms`);
  console.log(`  Tokens: in=${analysis.usage.input_tokens} out=${analysis.usage.output_tokens}`);
  console.log(`  Sheet elegido: ${analysis.mapping.sheet_name}`);
  console.log(`  Insertion row: ${analysis.mapping.insertion_row}`);
  console.log(`  Columns mapeadas:`);
  const humanOnlySet = new Set(analysis.mapping.human_only_columns);
  for (const [col, field] of Object.entries(analysis.mapping.columns)) {
    console.log(`    ${col} → ${field}${humanOnlySet.has(col) ? '  [SOLO YO]' : ''}`);
  }
  if (analysis.mapping.notes) console.log(`  Notes: ${analysis.mapping.notes}`);
  console.log();

  const timestamp = Date.now();
  const storagePath = `${PORTAL_EMAIL}/${NELIA_AGENT_ID}/template-${timestamp}.xlsx`;
  console.log(`Subiendo a bucket bitacora-templates: ${storagePath}`);
  const { error: upErr } = await supabase.storage
    .from('bitacora-templates')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert:      true,
    });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);
  console.log('  OK\n');

  const templatePayload = {
    url:            storagePath,
    filename:       FILENAME,
    mapping:        analysis.mapping,
    uploaded_at:    new Date().toISOString(),
    uploaded_by:    'admin-script',
    ai_usage:       analysis.usage,
    charged_tasks:  0, // admin path
  };
  console.log(`Guardando mapping en voice_agents.bitacora_template (${NELIA_AGENT_ID})...`);
  const { error: dbErr } = await supabase
    .from('voice_agents')
    .update({ bitacora_template: templatePayload })
    .eq('id', NELIA_AGENT_ID);
  if (dbErr) throw new Error(`db update failed: ${dbErr.message}`);
  console.log('  OK\n');

  const { data: verify } = await supabase
    .from('voice_agents')
    .select('bitacora_template')
    .eq('id', NELIA_AGENT_ID).single();
  const saved = (verify?.bitacora_template as any);
  console.log('Verificación en DB:');
  console.log(`  filename: ${saved?.filename}`);
  console.log(`  url: ${saved?.url}`);
  console.log(`  human_only_columns: ${JSON.stringify(saved?.mapping?.human_only_columns)}`);

  console.log('\nDone. Nelia ahora usará el formato de Tortillería Estrella en la bitácora semanal.');
}

main().catch(err => { console.error(err); process.exit(1); });
