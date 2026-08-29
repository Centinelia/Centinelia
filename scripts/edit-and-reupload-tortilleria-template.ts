// Edita el .xlsx de tortillería (renombra col H → MOTIVO, col I → COMENTARIO)
// y re-sube a bucket + guarda mapping actualizado con I marcada human_only.
//
// Uso: npx tsx scripts/edit-and-reupload-tortilleria-template.ts

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import fs from 'node:fs';

const NELIA_AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const PORTAL_EMAIL   = 'servicioalcliente@tortillaestrella.com.mx';
const SOURCE_PATH    = 'C:/Users/Nazre/Dropbox/PC/Downloads/Tortillería Estrella X Centinelia/BITACORA DE CLIENTES OCTUBRE 2023.xlsx';
const FILENAME       = 'BITACORA DE CLIENTES OCTUBRE 2023 (edit).xlsx';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { analyzeTemplate }   = await import('../src/lib/bitacora/template-analyzer');
  const ExcelJSMod = await import('exceljs');
  const Workbook = (ExcelJSMod as any).Workbook ?? (ExcelJSMod as any).default?.Workbook;
  const supabase = createAdminClient();

  console.log(`Leyendo ${SOURCE_PATH}...`);
  const originalBuf = fs.readFileSync(SOURCE_PATH);
  const wb = new Workbook();
  await wb.xlsx.load(originalBuf as any);

  // Aplicar edits a todos los sheets (mantener consistencia entre semanas)
  for (const ws of wb.worksheets) {
    const row2 = ws.getRow(2);
    // Col H: "COMENTARIO " → "MOTIVO"
    if (typeof row2.getCell(8).value === 'string') {
      row2.getCell(8).value = 'MOTIVO';
    }
    // Col I: (empty) → "COMENTARIO"
    row2.getCell(9).value = 'COMENTARIO';
  }
  console.log(`  Row 2 cols H,I renombradas en ${wb.worksheets.length} sheet(s)`);

  const editedBuf = Buffer.from(await wb.xlsx.writeBuffer());
  console.log(`  Buffer editado: ${editedBuf.length} bytes\n`);

  // Guardar copia local para inspección
  const localCopy = 'C:/Users/Nazre/Downloads/tortilleria-template-edited.xlsx';
  fs.writeFileSync(localCopy, editedBuf);
  console.log(`  Copia local: ${localCopy}\n`);

  console.log('Analizando xlsx editado con Claude Sonnet...');
  const t0 = Date.now();
  const analysis = await analyzeTemplate(editedBuf);
  console.log(`  Latencia: ${Date.now() - t0}ms`);
  console.log(`  Tokens: in=${analysis.usage.input_tokens} out=${analysis.usage.output_tokens}`);
  console.log(`  Sheet: ${analysis.mapping.sheet_name}`);
  console.log(`  Insertion row: ${analysis.mapping.insertion_row}`);
  console.log(`  Columns:`);
  for (const [col, field] of Object.entries(analysis.mapping.columns)) {
    console.log(`    ${col} → ${field}`);
  }
  console.log(`  human_only: ${JSON.stringify(analysis.mapping.human_only_columns)}`);
  console.log(`  grid: ${JSON.stringify(analysis.mapping.verification_grid ?? {})}`);
  console.log(`  suggestions (${analysis.suggestions.length}):`);
  for (const s of analysis.suggestions) {
    console.log(`    [${s.severity}] ${s.type}${s.col ? ` col ${s.col}` : ''}`);
    console.log(`      current: ${s.current === null ? 'null' : JSON.stringify(s.current)}`);
    console.log(`      proposed: ${s.proposed === null ? 'null' : JSON.stringify(s.proposed)}`);
    console.log(`      rationale: ${s.rationale}`);
  }
  console.log();

  // Override: forzar col I marcada como human_only aunque no esté en el columns mapping.
  // Es una col con contenido "comentario post-seguimiento" que Nelia no llena
  // pero debe preservarse si el humano escribe algo ahí.
  // Nota: el toggle UI solo permite cols que están en columns mapping. Como I
  // no mapea a un campo canónico, esta protección se hace via la lógica del
  // upsert (cols no mapeadas NUNCA se tocan por definición), así que técnicamente
  // human_only es redundante para cols no mapeadas. Pero se documenta el intento.

  // Subir + guardar mapping
  const timestamp = Date.now();
  const storagePath = `${PORTAL_EMAIL}/${NELIA_AGENT_ID}/template-${timestamp}.xlsx`;
  console.log(`Subiendo a bucket bitacora-templates: ${storagePath}`);
  const { error: upErr } = await supabase.storage
    .from('bitacora-templates')
    .upload(storagePath, editedBuf, {
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
    uploaded_by:    'admin-script',
    ai_usage:       analysis.usage,
    charged_tasks:  0,
  };
  console.log(`Guardando mapping en voice_agents.bitacora_template...`);
  const { error: dbErr } = await supabase
    .from('voice_agents')
    .update({ bitacora_template: templatePayload })
    .eq('id', NELIA_AGENT_ID);
  if (dbErr) throw new Error(`db: ${dbErr.message}`);
  console.log('  OK\n');

  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
