// E2E del flow persistente de bitácora.
// Valida:
//   1. updateLiveWorkbook crea archivo inicial desde template
//   2. Al editar vendedor manualmente + volver a correr, se preserva
//   3. Otras cols se re-generan desde DB (correcciones aplican)
//
// No depende del cron — llama updateLiveWorkbook directo.
// Cleanup automático al final (restaura template previo del agente).
//
// Uso: npx tsx scripts/e2e-bitacora-persistent.ts

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const NELIA_AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const PORTAL_EMAIL   = 'servicioalcliente@tortillaestrella.com.mx';

async function main() {
  const { createAdminClient }         = await import('../src/lib/supabase/admin');
  const ExcelJSMod                    = await import('exceljs');
  const Workbook                      = (ExcelJSMod as any).Workbook ?? (ExcelJSMod as any).default?.Workbook;
  const { updateLiveWorkbook }        = await import('../src/lib/bitacora/live-workbook');
  const { extractHumanEditedValues }  = await import('../src/lib/bitacora/template-render');
  const { weekStartMonday, monthStart, weekNumberInMonth, saturdaysInMonthUpTo } =
                                        await import('../src/lib/bitacora/schedule');
  const supabase = createAdminClient();

  const testId = `e2e-${Date.now()}`;
  console.log(`\nE2E test id: ${testId}\n`);

  // Guardar template previo del agente para restaurar al final
  const { data: agentBefore } = await supabase
    .from('voice_agents')
    .select('bitacora_template')
    .eq('id', NELIA_AGENT_ID)
    .single();
  const previousTemplate = agentBefore?.bitacora_template ?? null;
  console.log('Template previo del agente:', previousTemplate ? 'existía (se restaura al final)' : 'ninguno');

  try {
    console.log('\n═══ STEP 1: Crear plantilla test en memoria ═══\n');
    const templateBuffer = await createTestTemplate(Workbook);
    console.log(`  Template size: ${templateBuffer.length} bytes`);

    console.log('\n═══ STEP 2: Subir plantilla a bitacora-templates ═══\n');
    const templatePath = `${PORTAL_EMAIL}/${NELIA_AGENT_ID}/${testId}-template.xlsx`;
    const { error: tplUpErr } = await supabase.storage
      .from('bitacora-templates')
      .upload(templatePath, templateBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert:      true,
      });
    if (tplUpErr) throw new Error(`template upload: ${tplUpErr.message}`);
    console.log(`  Path: ${templatePath}`);

    console.log('\n═══ STEP 3: Configurar mapping en voice_agents (skip Claude) ═══\n');
    const mapping = {
      sheet_name:         'Bitacora',
      insertion_row:      3,
      columns: {
        A: 'fecha',
        B: 'business_name',
        C: 'contact_name',
        D: 'contact_phone',
        E: 'motivo',
        F: 'vendedor',
      } as Record<string, string>,
      human_only_columns: ['F'],  // vendedor solo humano
    };
    const templatePayload = {
      url:         templatePath,
      filename:    `${testId}-template.xlsx`,
      mapping,
      uploaded_at: new Date().toISOString(),
      uploaded_by: testId,
    };
    await supabase.from('voice_agents')
      .update({ bitacora_template: templatePayload })
      .eq('id', NELIA_AGENT_ID);
    console.log('  Mapping guardado');

    console.log('\n═══ STEP 4: Query incidents reales del mes actual ═══\n');
    const now = new Date();
    const mStart = monthStart(now);
    const mEnd = new Date(mStart); mEnd.setMonth(mStart.getMonth() + 1);
    const { data: monthIncidents } = await supabase
      .from('client_incidents')
      .select('*')
      .eq('agent_id', NELIA_AGENT_ID)
      .gte('created_at', mStart.toISOString())
      .lt('created_at', mEnd.toISOString())
      .order('created_at', { ascending: true });
    console.log(`  Incidents en el mes: ${(monthIncidents ?? []).length}`);
    if (!monthIncidents || monthIncidents.length === 0) {
      throw new Error('No hay incidents del mes actual para este agente. Corre las llamadas de test primero.');
    }

    console.log('\n═══ STEP 5: Construir weeks del mes ═══\n');
    const sats = saturdaysInMonthUpTo(now);
    const weeks = [];
    for (const sat of sats) {
      const weekMonday = weekStartMonday(sat);
      const weekEnd = new Date(weekMonday); weekEnd.setDate(weekMonday.getDate() + 7);
      const weekIncidents = monthIncidents.filter((i: any) => {
        const d = new Date(i.created_at);
        return d >= weekMonday && d < weekEnd;
      });
      weeks.push({
        weekNumber: weekNumberInMonth(sat),
        weekStart:  weekMonday,
        weekEnd,
        incidents:  weekIncidents as any,
      });
      console.log(`  Semana ${weekNumberInMonth(sat)} (sab ${sat.toISOString().slice(0,10)}): ${weekIncidents.length} incidents`);
    }
    // Si hoy no es sábado y su semana no está cubierta por los sábados
    // previos, agregar la semana de hoy. Dedupe por weekNumber al final.
    const todayMonday = weekStartMonday(now);
    if (!weeks.some(w => w.weekStart.getTime() === todayMonday.getTime())) {
      const weekEnd = new Date(todayMonday); weekEnd.setDate(todayMonday.getDate() + 7);
      const weekIncidents = monthIncidents.filter((i: any) => {
        const d = new Date(i.created_at);
        return d >= todayMonday && d < weekEnd;
      });
      weeks.push({
        weekNumber: weekNumberInMonth(now),
        weekStart:  todayMonday,
        weekEnd,
        incidents:  weekIncidents as any,
      });
      console.log(`  Semana ${weekNumberInMonth(now)} (hoy, agregada): ${weekIncidents.length} incidents`);
    }
    // Dedupe por weekNumber (mantiene el primero — todos con mismo weekNumber
    // describen la misma semana Lun-Dom)
    const seenNums = new Set<number>();
    const dedupedWeeks = weeks.filter(w => {
      if (seenNums.has(w.weekNumber)) return false;
      seenNums.add(w.weekNumber);
      return true;
    });
    if (dedupedWeeks.length !== weeks.length) {
      console.log(`  Deduped: ${weeks.length} → ${dedupedWeeks.length} weeks`);
    }
    weeks.length = 0;
    weeks.push(...dedupedWeeks);

    const monthKey = `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`;
    const livePath = `${PORTAL_EMAIL}/${NELIA_AGENT_ID}/${testId}-${monthKey}.xlsx`;
    console.log(`  Live path: ${livePath}`);

    console.log('\n═══ STEP 6: Primer run — crear live file inicial ═══\n');
    const liveBuf1 = await updateLiveWorkbook({
      supabase,
      templateBuffer,
      livePath,
      mapping: mapping as any,
      weeks,
    });
    console.log(`  Buffer size: ${liveBuf1.length} bytes`);
    await supabase.storage.from('bitacora-live').upload(livePath, liveBuf1, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert:      true,
    });

    console.log('\n═══ STEP 7: Inspeccionar live file inicial ═══\n');
    const wb1 = new Workbook();
    await wb1.xlsx.load(liveBuf1 as any);
    for (const ws of wb1.worksheets) {
      console.log(`\n  Sheet: ${ws.name}`);
      ws.eachRow({ includeEmpty: false }, (row, r) => {
        if (r < mapping.insertion_row) return;
        const cells = [];
        for (let c = 1; c <= 8; c++) {
          const v = row.getCell(c).value;
          if (v != null && v !== '') cells.push(`${String.fromCharCode(64+c)}=${v}`);
        }
        if (cells.length) console.log(`    row ${r}: ${cells.join(' | ')}`);
      });
    }

    console.log('\n═══ STEP 8: Simular ediciones del cliente en el live file ═══\n');
    const firstIncidentId = monthIncidents[0].id;
    const wb2 = new Workbook();
    await wb2.xlsx.load(liveBuf1 as any);
    let sheetTarget: any = null;
    let hiddenCol = 0;
    let targetRowNum = 0;
    for (const ws of wb2.worksheets) {
      let hc = 0;
      ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
        if (cell.value === '_incident_id') hc = col;
      });
      if (!hc) continue;
      ws.eachRow({ includeEmpty: false }, (row, r) => {
        if (r < mapping.insertion_row) return;
        if (row.getCell(hc).value === firstIncidentId) {
          sheetTarget = ws;
          hiddenCol = hc;
          targetRowNum = r;
        }
      });
      if (sheetTarget) break;
    }
    if (!sheetTarget) throw new Error(`No encontré row con incident_id ${firstIncidentId}`);

    // Edición 1: col F vendedor (human_only) — DEBE persistir
    console.log(`  [ed1] col F (vendedor, human_only) → "Juan Pérez"`);
    sheetTarget.getCell(targetRowNum, 6).value = 'Juan Pérez';

    // Edición 2: col E motivo (NO human_only) — DEBE ser sobrescrito por DB
    console.log(`  [ed2] col E (motivo, no human_only) → "EDITADO A MANO — se debe sobrescribir"`);
    sheetTarget.getCell(targetRowNum, 5).value = 'EDITADO A MANO — se debe sobrescribir';

    // Edición 3: agregar row nueva del cliente (sin incident_id) — DEBE persistir
    const customRowNum = sheetTarget.lastRow.number + 1;
    console.log(`  [ed3] row ${customRowNum} nueva del cliente en col B → "Nota manual del jefe"`);
    sheetTarget.getCell(customRowNum, 2).value = 'Nota manual del jefe';
    sheetTarget.getCell(customRowNum, 5).value = 'Punto pendiente para la junta';

    // Edición 4: agregar col nueva fuera del mapping — DEBE persistir
    console.log(`  [ed4] col H (fuera de mapping) → "Prioridad Alta"`);
    sheetTarget.getRow(1).getCell(8).value = 'Prioridad';
    sheetTarget.getCell(targetRowNum, 8).value = 'Alta';

    const editedBuf = Buffer.from(await wb2.xlsx.writeBuffer());
    await supabase.storage.from('bitacora-live').upload(livePath, editedBuf, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert:      true,
    });
    console.log('  Live file editado y re-subido');

    console.log('\n═══ STEP 9: Segundo run (upsert no destructivo) ═══\n');
    const liveBuf3 = await updateLiveWorkbook({
      supabase,
      templateBuffer,
      livePath,
      mapping: mapping as any,
      weeks,
    });
    await supabase.storage.from('bitacora-live').upload(livePath, liveBuf3, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert:      true,
    });
    console.log(`  Buffer size: ${liveBuf3.length} bytes`);

    console.log('\n═══ STEP 10: Verificar preservación ═══\n');
    const wb3 = new Workbook();
    await wb3.xlsx.load(liveBuf3 as any);
    const targetSheet3 = wb3.getWorksheet(sheetTarget.name);
    if (!targetSheet3) throw new Error('sheet target no encontrada en wb3');

    // Encontrar la row del incident target
    let hiddenCol3 = 0;
    targetSheet3.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      if (cell.value === '_incident_id') hiddenCol3 = col;
    });
    let targetRow3 = 0;
    targetSheet3.eachRow({ includeEmpty: false }, (row, r) => {
      if (r < mapping.insertion_row) return;
      if (row.getCell(hiddenCol3).value === firstIncidentId) targetRow3 = r;
    });

    const results = { pass: 0, fail: 0 };
    const check = (name: string, actual: any, expected: any) => {
      const ok = actual === expected;
      console.log(`  ${ok ? '✅' : '❌'} ${name}`);
      console.log(`     actual:   "${actual}"`);
      console.log(`     expected: "${expected}"`);
      ok ? results.pass++ : results.fail++;
    };

    // Check 1: vendedor persistió (human_only)
    check(
      'Vendedor "Juan Pérez" persiste (col F, human_only)',
      targetSheet3.getCell(targetRow3, 6).value,
      'Juan Pérez',
    );

    // Check 2: motivo sobrescrito con DB (no human_only)
    check(
      'Motivo sobrescrito por DB (col E, NO human_only)',
      targetSheet3.getCell(targetRow3, 5).value,
      monthIncidents[0].motivo,
    );

    // Check 3: row del cliente persiste (sin incident_id)
    let foundCustomRow = false;
    targetSheet3.eachRow({ includeEmpty: false }, (row, r) => {
      if (row.getCell(2).value === 'Nota manual del jefe') foundCustomRow = true;
    });
    check('Row manual del cliente persiste (sin incident_id)', foundCustomRow, true);

    // Check 4: col nueva del cliente persiste
    check(
      'Col H "Prioridad" persiste en header',
      targetSheet3.getRow(1).getCell(8).value,
      'Prioridad',
    );
    check(
      'Col H "Alta" persiste en row del incident',
      targetSheet3.getCell(targetRow3, 8).value,
      'Alta',
    );

    console.log(`\n  RESULTADO: ${results.pass} pass / ${results.fail} fail`);

  } finally {
    console.log('\n═══ CLEANUP ═══\n');
    // Restaurar template previo (o null si no había)
    await supabase.from('voice_agents')
      .update({ bitacora_template: previousTemplate })
      .eq('id', NELIA_AGENT_ID);
    console.log('  Template del agente restaurado');

    // Remover archivos de storage con el testId
    const { data: tplList } = await supabase.storage
      .from('bitacora-templates')
      .list(`${PORTAL_EMAIL}/${NELIA_AGENT_ID}`);
    const tplToRemove = (tplList ?? []).filter(f => f.name.includes(testId)).map(f => `${PORTAL_EMAIL}/${NELIA_AGENT_ID}/${f.name}`);
    if (tplToRemove.length) {
      await supabase.storage.from('bitacora-templates').remove(tplToRemove);
      console.log(`  Removed ${tplToRemove.length} template file(s)`);
    }

    const { data: liveList } = await supabase.storage
      .from('bitacora-live')
      .list(`${PORTAL_EMAIL}/${NELIA_AGENT_ID}`);
    const liveToRemove = (liveList ?? []).filter(f => f.name.includes(testId)).map(f => `${PORTAL_EMAIL}/${NELIA_AGENT_ID}/${f.name}`);
    if (liveToRemove.length) {
      await supabase.storage.from('bitacora-live').remove(liveToRemove);
      console.log(`  Removed ${liveToRemove.length} live file(s)`);
    }

    console.log('\nDone.\n');
  }
}

async function createTestTemplate(Workbook: any): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Bitacora');

  // Row 1: header bonito con colores (simula plantilla real de negocio)
  const headers = ['Fecha', 'Negocio', 'Contacto', 'Teléfono', 'Motivo', 'Vendedor'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(1, i + 1);
    cell.value = h;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE066' } };
    cell.font = { bold: true, color: { argb: 'FF1A0A3B' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { bottom: { style: 'thin' } };
  });

  // Row 2: subheader vacío (estilo tarjetas)
  ws.getRow(2).height = 8;

  // Row 3: template row (insertion_row)
  for (let c = 1; c <= 6; c++) {
    const cell = ws.getCell(3, c);
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
    cell.alignment = { vertical: 'middle' };
  }

  // Col widths
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 15;
  ws.getColumn(5).width = 40;
  ws.getColumn(6).width = 18;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

main().catch(err => { console.error(err); process.exit(1); });
