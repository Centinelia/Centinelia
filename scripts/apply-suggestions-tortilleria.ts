// Aplica las 5 sugerencias de Claude al template de Tortillería:
// 1. Col B "FECHA SEGUIMIENTO" → "FECHA VERIFICACION"
// 2. Col C "FECHA SEGUIMIENTO" duplicada → "SUCURSAL"
// 3. Col H "COMENTARIO" → "MOTIVO" (ya aplicado)
// 4. Col I → "RESULTADO SEGUIMIENTO"
// 5. Grid K-P: row 2 mergeado (placeholder para rango de fechas), row 3 L/M/MI/J/V/S
// Adicional: widen cols A-J para que headers quepan sin wrap.
//
// Uso: npx tsx scripts/apply-suggestions-tortilleria.ts

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import fs from 'node:fs';

const NELIA_AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const PORTAL_EMAIL   = 'servicioalcliente@tortillaestrella.com.mx';
const SOURCE_PATH    = 'C:/Users/Nazre/Dropbox/PC/Downloads/Tortillería Estrella X Centinelia/BITACORA DE CLIENTES OCTUBRE 2023.xlsx';
const FILENAME       = 'BITACORA CLIENTES (con sugerencias).xlsx';

// Placeholder que se reemplaza runtime con el rango de fechas semanal.
// El renderer detecta esta string en row 2 K:P y la reemplaza con "24-30 AGO" etc.
const WEEK_RANGE_PLACEHOLDER = '{{RANGO_SEMANA}}';

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

  for (const ws of wb.worksheets) {
    // Encontrar merges existentes en row 2 K:P (o row 1 K:Q) — deshacer primero
    // porque el editor original tenía K1:Q1 mergeado para el título.
    const existingMerges: string[] = [];
    const model = (ws as any).model;
    if (model?.merges) {
      for (const m of model.merges) {
        if (typeof m === 'string') existingMerges.push(m);
      }
    }
    for (const m of existingMerges) {
      // Solo deshacer merges que están en el rango K-Q para no romper otros
      if (/[K-Q]/i.test(m)) {
        try { ws.unMergeCells(m); } catch { /* puede fallar si ya no está */ }
      }
    }

    // Row 2: renames
    const row2 = ws.getRow(2);
    row2.getCell(2).value = 'FECHA VERIFICACION';    // B
    row2.getCell(3).value = 'SUCURSAL';              // C
    row2.getCell(8).value = 'MOTIVO';                // H
    row2.getCell(9).value = 'RESULTADO SEGUIMIENTO'; // I

    // Row 2 K-P: limpiar valores existentes (había "L 09/oct", "M", etc)
    for (let c = 11; c <= 16; c++) {
      row2.getCell(c).value = null;
    }
    // Row 2 Q en adelante hasta Z: limpiar cols de la "siguiente semana" que
    // arrastraba el template original ("L 16 oct" etc — confuso al mezclar
    // dos semanas en una sola tabla).
    for (let c = 17; c <= 26; c++) {
      row2.getCell(c).value = null;
    }
    // (Row 1 cleanup se hace más abajo, después del merge K2:P2, para no
    //  colisionar con el título merged que vamos a poner ahí.)
    // Row 2 K:P → set placeholder centrado en K (que después se mergea)
    const kCell = row2.getCell(11);
    kCell.value = WEEK_RANGE_PLACEHOLDER;
    kCell.alignment = { horizontal: 'center', vertical: 'middle' };
    kCell.font = { bold: true, color: { argb: 'FF1A0A3B' } };
    kCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E3F5' } };

    // Merge K2:P2 con el placeholder centrado
    try { ws.mergeCells('K2:P2'); } catch { /* ya mergeado, ignorar */ }

    // Row 1 K:P — el título "SEGUIMIENTO DEL CLIENTE EN SU SERVICIO PRIMER MES"
    // era originalmente merged sobre K1:Q1. Después de unmerge quedó huérfano
    // en K1 y bleedea visualmente. Ponemos un título corto centrado sobre el
    // rango del grid + re-merge K1:P1 para que no se salga.
    const row1 = ws.getRow(1);
    for (let c = 11; c <= 26; c++) row1.getCell(c).value = null;
    const k1 = row1.getCell(11);
    k1.value = 'SEGUIMIENTO SEMANAL';
    k1.alignment = { horizontal: 'center', vertical: 'middle' };
    k1.font = { bold: true, color: { argb: 'FF1A0A3B' }, size: 11 };
    k1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD7CDF7' } };
    try { ws.mergeCells('K1:P1'); } catch { /* ya mergeado */ }

    // Insertar nueva row 3: L/M/MI/J/V/S en K-P, resto vacío
    // Usamos insertRow para desplazar todo hacia abajo.
    // Como insertRow puede tener issues con merges/estilos preservados, hacemos
    // un enfoque más manual: shift rows manualmente.
    // ExcelJS's spliceRows(3, 0, arr) inserta sin borrar.
    ws.spliceRows(3, 0, ['', '', '', '', '', '', '', '', '', '', 'L', 'M', 'MI', 'J', 'V', 'S']);
    const newRow3 = ws.getRow(3);
    newRow3.height = 22;
    for (let c = 11; c <= 16; c++) {
      const cell = newRow3.getCell(c);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { bold: true, color: { argb: 'FF1A0A3B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF7FF' } };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
    }

    // Widen cols para que headers quepan sin wrap
    ws.getColumn(1).width  = 14;  // A FECHA DE LLAMADA
    ws.getColumn(2).width  = 18;  // B FECHA VERIFICACION
    ws.getColumn(3).width  = 14;  // C SUCURSAL
    ws.getColumn(4).width  = 30;  // D NEGOCIO
    ws.getColumn(5).width  = 22;  // E CONTACTO
    ws.getColumn(6).width  = 38;  // F DIRECCION
    ws.getColumn(7).width  = 14;  // G TELEFONO
    ws.getColumn(8).width  = 45;  // H MOTIVO
    ws.getColumn(9).width  = 28;  // I RESULTADO SEGUIMIENTO
    ws.getColumn(10).width = 18;  // J VENDEDOR
    for (let c = 11; c <= 16; c++) {
      ws.getColumn(c).width = 5;  // K-P grid días — angostos
    }

    // WrapText en headers row 2 para permitir 2 líneas si aún no cabe
    for (let c = 1; c <= 10; c++) {
      const cell = row2.getCell(c);
      cell.alignment = { ...(cell.alignment ?? {}), wrapText: true, vertical: 'middle', horizontal: 'center' };
    }
    row2.height = 32;
  }
  console.log(`  Cambios aplicados en ${wb.worksheets.length} sheet(s)`);

  const editedBuf = Buffer.from(await wb.xlsx.writeBuffer());
  const localCopy = 'C:/Users/Nazre/Downloads/tortilleria-template-final.xlsx';
  fs.writeFileSync(localCopy, editedBuf);
  console.log(`  Copia local: ${localCopy}`);
  console.log(`  Buffer editado: ${editedBuf.length} bytes\n`);

  console.log('Analizando con Claude Sonnet...');
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
    console.log(`    [${s.severity}] ${s.type}${s.col ? ` col ${s.col}` : ''}: ${s.rationale.slice(0, 100)}...`);
  }
  console.log();

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
    uploaded_by:    'admin-script-sugerencias',
    ai_usage:       analysis.usage,
    charged_tasks:  0,
  };
  console.log('Guardando mapping en voice_agents.bitacora_template...');
  const { error: dbErr } = await supabase
    .from('voice_agents')
    .update({ bitacora_template: templatePayload })
    .eq('id', NELIA_AGENT_ID);
  if (dbErr) throw new Error(`db: ${dbErr.message}`);
  console.log('  OK\n');

  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
